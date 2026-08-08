// Fetches stats.php and renders it into the tables/KPIs on admin-stats.html.
(function () {
  function fmtMs(ms) {
    if (!ms || ms <= 0) return '0s';
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleString();
  }

  function fillTable(id, rows, renderRow) {
    const tbody = document.querySelector(`#${id} tbody`);
    tbody.innerHTML = '';
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim);">No data yet — browse the site to generate events.</td></tr>';
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = renderRow(row);
      tbody.appendChild(tr);
    });
  }

  async function loadStats() {
    try {
      const res = await fetch('stats.php');
      const data = await res.json();

      document.getElementById('kpi-visitors').textContent = data.visitors;
      document.getElementById('kpi-pageviews').textContent = data.pageviews;

      fillTable('table-top-pages', data.topPages, (r) => `<td>${r.page}</td><td>${r.views}</td>`);

      fillTable('table-time-page', data.timePerPage, (r) =>
        `<td>${r.page}</td><td>${fmtMs(r.total_ms)}</td><td>${fmtMs(r.avg_ms)}</td>`
      );

      fillTable('table-time-section', data.timePerSection, (r) =>
        `<td>${r.section}</td><td>${fmtMs(r.total_ms)}</td>`
      );

      fillTable('table-top-projects', data.topProjects, (r) =>
        `<td>${r.project_id}</td><td>${r.clicks}</td><td>${fmtMs(r.total_ms)}</td>`
      );

      fillTable('table-recent', data.recentEvents, (r) =>
        `<td>${r.event_type}</td><td>${r.page}</td><td>${r.section || r.project_id || '—'}</td><td>${
          r.duration_ms ? fmtMs(r.duration_ms) : '—'
        }</td><td>${fmtDate(r.created_at)}</td>`
      );
    } catch (err) {
      console.error('Failed to load stats', err);
    }
  }

  loadStats();
  setInterval(loadStats, 15000);
})();
