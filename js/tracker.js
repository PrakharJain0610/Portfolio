/**
 * tracker.js — minimal user-behaviour tracker.
 *
 * What it records (see README.md "Tracking" section for full details):
 *   - "pageview"      fired once when a page loads
 *   - "page_time"     accumulated time the page was actually visible
 *   - "section_time"  accumulated time each <section data-section="..."> was visible
 *   - "project_click" a project card/link was clicked
 *   - "project_time"  accumulated time a project detail page ([data-project]) was viewed
 *
 * Timers only run while the tab is actually visible (document.visibilityState
 * === 'visible'). Whenever the tab is hidden, or the page is finally
 * unloading, whatever time has accumulated so far is queued as ONE event and
 * the accumulator resets to zero — so if the visitor comes back, the next
 * segment is sent as its own row instead of re-sending an overlapping total
 * from the original page-load time. That avoids the duplicate/inflated rows
 * that a naive "record elapsed-since-load on every hide" approach produces.
 *
 * Events are batched in memory and flushed to track.php:
 *   - every 10s (setInterval)
 *   - whenever the tab becomes hidden (sendBeacon)
 *   - immediately when the page is unloaded (sendBeacon, pagehide)
 *
 * A random session id is stored in localStorage so repeat visits in the same
 * browser share one session id (no cookies, no personal data collected).
 */
(function () {
  const PAGE = document.body.dataset.page || location.pathname.split('/').pop() || 'index.html';
  const PROJECT_ID = document.body.dataset.project || null;

  function getSessionId() {
    let id = localStorage.getItem('pf_session_id');
    if (!id) {
      id = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('pf_session_id', id);
    }
    return id;
  }

  const sessionId = getSessionId();
  const queue = [];

  function queueEvent(evt) {
    queue.push(Object.assign({ session_id: sessionId, page: PAGE }, evt));
  }

  function flush(useBeacon) {
    if (queue.length === 0) return;
    const payload = JSON.stringify({ events: queue.splice(0, queue.length) });

    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('track.php', blob);
    } else {
      fetch('track.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        /* tracking must never break the page */
      });
    }
  }

  // ---- pageview (fires once, immediately) ----
  queueEvent({ event_type: 'pageview' });

  const isVisible = () => document.visibilityState === 'visible';

  // ---- accumulated time-on-page (only counts while the tab is visible) ----
  let pageVisibleSince = isVisible() ? performance.now() : null;
  let pageAccumMs = 0;

  function pausePageTimer() {
    if (pageVisibleSince != null) {
      pageAccumMs += performance.now() - pageVisibleSince;
      pageVisibleSince = null;
    }
  }
  function resumePageTimer() {
    if (pageVisibleSince == null) pageVisibleSince = performance.now();
  }
  function flushPageTimer() {
    pausePageTimer();
    if (pageAccumMs > 0) {
      queueEvent({ event_type: 'page_time', duration_ms: pageAccumMs });
      pageAccumMs = 0;
    }
  }

  // ---- accumulated time-on-project (same idea, only on project detail pages) ----
  let projectVisibleSince = PROJECT_ID && isVisible() ? performance.now() : null;
  let projectAccumMs = 0;

  function pauseProjectTimer() {
    if (projectVisibleSince != null) {
      projectAccumMs += performance.now() - projectVisibleSince;
      projectVisibleSince = null;
    }
  }
  function resumeProjectTimer() {
    if (PROJECT_ID && projectVisibleSince == null) projectVisibleSince = performance.now();
  }
  function flushProjectTimer() {
    if (!PROJECT_ID) return;
    pauseProjectTimer();
    if (projectAccumMs > 0) {
      queueEvent({ event_type: 'project_time', project_id: PROJECT_ID, duration_ms: projectAccumMs });
      projectAccumMs = 0;
    }
  }

  // ---- accumulated time per section, using IntersectionObserver ----
  const sectionAccum = new Map();        // element -> accumulated ms not yet sent
  const sectionSince = new Map();        // element -> timestamp visible since (or null)
  const sectionIntersecting = new Map(); // element -> is it currently ≥40% on screen

  function pauseSection(el) {
    const since = sectionSince.get(el);
    if (since != null) {
      sectionAccum.set(el, (sectionAccum.get(el) || 0) + (performance.now() - since));
      sectionSince.set(el, null);
    }
  }
  function resumeSection(el) {
    if (sectionSince.get(el) == null) sectionSince.set(el, performance.now());
  }
  function flushSectionTimers() {
    sections.forEach((el) => {
      pauseSection(el);
      const total = sectionAccum.get(el) || 0;
      if (total > 0) {
        queueEvent({ event_type: 'section_time', section: el.dataset.section, duration_ms: total });
        sectionAccum.set(el, 0);
      }
    });
  }

  const sections = document.querySelectorAll('[data-section]');
  if (sections.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          sectionIntersecting.set(entry.target, entry.isIntersecting);
          if (!isVisible()) return; // don't start/stop timers while the tab itself is hidden
          if (entry.isIntersecting) resumeSection(entry.target);
          else pauseSection(entry.target);
        });
      },
      { threshold: 0.4 }
    );
    sections.forEach((el) => observer.observe(el));
  }

  // ---- project card / link clicks (anywhere with data-project-click) ----
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-project-click]');
    if (target) {
      queueEvent({
        event_type: 'project_click',
        project_id: target.dataset.projectClick,
      });
    }
  });

  // ---- pause everything when hidden, resume when visible again ----
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPageTimer();
      flushProjectTimer();
      flushSectionTimers();
      flush(true); // best-effort send in case the tab never comes back (e.g. mobile backgrounding)
    } else {
      resumePageTimer();
      resumeProjectTimer();
      sections.forEach((el) => {
        if (sectionIntersecting.get(el)) resumeSection(el);
      });
    }
  });

  // ---- final send on actual unload (covers the case visibilitychange didn't fire) ----
  window.addEventListener('pagehide', () => {
    flushPageTimer();
    flushProjectTimer();
    flushSectionTimers();
    flush(true);
  });

  // ---- flush on interval (sends whatever's queued, e.g. clicks + pageview) ----
  setInterval(() => flush(false), 10000);
})();
