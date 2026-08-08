# Data Portfolio — Power BI & SQL

A minimal, multi-page portfolio site — **plain HTML, CSS, and JavaScript
only** — for showcasing Power BI dashboards and SQL projects (all pulled from
[github.com/PrakharJain0610](https://github.com/PrakharJain0610)), with a
small built-in **user behaviour tracking** system backed by MySQL.

This document explains how the whole thing is built so anyone — including a
beginner — can read it top to bottom and understand exactly what happens.

---

## 1. What's in this project

```
portfolio/
├── config.php            Loads DB creds from .env, opens the MySQL connection
├── track.php               Receives tracking events from tracker.js, inserts into MySQL
├── stats.php                 Runs read-only queries for the admin dashboard
├── .env.example                Template for your local .env (DB creds)
├── .htaccess                     Blocks direct access to .env / schema.sql / README.md
├── schema.sql                      MySQL table used to store tracking events
├── README.md                         This file
├── index.html                          Home page
├── about.html                            About / experience page
├── projects.html                           Project gallery (Power BI + SQL)
├── project-bitcoin-analysis.html             Power BI project detail page
├── project-cricket-analysis.html               Power BI project detail page
├── project-survey-dashboard.html                 Power BI project detail page
├── project-sql-analysis.html                       SQL project detail page
├── admin-stats.html                                    Live analytics dashboard (demo)
├── css/style.css                                         All styling (one shared stylesheet)
└── js/
    ├── main.js            Mobile nav toggle + active-link highlighting
    ├── tracker.js          The behaviour-tracking script (see §3)
    └── admin.js             Fetches stats.php and renders admin-stats.html
```

**No Node.js, no npm, no build step, no frameworks.** The frontend is exactly
HTML + CSS + vanilla JavaScript (`document.querySelector`, `fetch`,
`IntersectionObserver`, etc. — no libraries). The only thing that isn't
"plain JS" is `track.php` / `stats.php` / `config.php`, and that's not
optional: **a browser cannot open a MySQL connection by itself** — there's no
socket API for it. Some server-side script has to sit between the tracker
and the database. PHP was chosen for that bridge because it needs zero
installs (ships with any basic host, or XAMPP/MAMP locally) and is about as
close to "plain" as a DB bridge can get — no Composer, no packages, just
three small `.php` files using PHP's built-in `mysqli` extension.

It is a genuine **multi-page site** — every page is its own `.html` file with
its own `<title>`, not a single-page app with JS routing. Navigation is plain
`<a href="...">` links.

---

## 2. How the site itself is built

- **No frameworks.** Every page is hand-written HTML, styled by one shared
  `css/style.css`, using CSS variables (`:root { --accent: ...; }`) for a
  consistent dark theme.
- **Shared layout by copy-paste, not templating.** Since there's no build
  step, the nav bar and footer are repeated in each HTML file. This keeps the
  project dependency-free and easy to open directly, at the cost of a little
  duplication — a deliberate trade-off for a "minimal, beginner-friendly"
  project.
- **Responsive nav**: `js/main.js` toggles a `.open` class on the nav links
  for small screens, and highlights the current page's link using a
  `data-page` attribute set on `<body>`.
- **Project cards** link out to individual project detail pages
  (`project-*.html`), each with an overview, a chart/screenshot placeholder,
  approach, and results section — swap the placeholder blocks for real Power
  BI screenshots or exported matplotlib charts.

---

## 3. User behaviour tracking — how it works

The goal: answer three questions a beginner can understand at a glance —
**which pages get visited, how long people stay on each section, and which
projects get the most attention** — using the simplest possible design.

### 3.1 High-level flow

```
Browser (tracker.js)  --batched JSON-->  track.php  -->  MySQL (events table)
Browser (admin.js)    <--JSON stats------ stats.php  <--  MySQL (events table)
```

1. Every page includes `js/tracker.js`.
2. `tracker.js` watches what the visitor does and queues small "events" in
   memory (no network call per action — batching keeps it lightweight).
3. Every 10 seconds, and immediately when the tab is closed/hidden, the queue
   is sent to `track.php` in one request using `navigator.sendBeacon` (the
   browser API designed specifically for "fire this off even as the page is
   unloading").
4. `track.php` validates each event and inserts the batch into a single
   MySQL table called `events` using a prepared statement (safe from SQL
   injection).
5. `admin-stats.html` + `js/admin.js` call `stats.php`, which runs a few
   `GROUP BY` queries over that same table and returns JSON, rendered as
   plain HTML tables — no charting library needed.

### 3.2 What gets tracked

| Event type      | Fired when...                                             | Answers                                  |
|------------------|-------------------------------------------------------------|--------------------------------------------|
| `pageview`        | A page finishes loading (once, immediately)                   | Which pages get visited, and how often     |
| `page_time`         | The tab is hidden, or the page unloads                          | How long people actually looked at each page |
| `section_time`        | A `<section data-section="...">` stops being ≥40% visible, the tab is hidden, or the page unloads | Which section on a page holds attention |
| `project_click`         | A card/link with `data-project-click="id"` is clicked             | Which projects get clicked from a list |
| `project_time`            | The tab is hidden, or a project detail page (`<body data-project="id">`) unloads | How long people actually read a project page |

Every event also carries a `session_id` (a random string generated once and
stored in `localStorage`, **no cookies, no personal data, no login**) so
events from the same visitor can be grouped without identifying who they are.

### 3.3 Timing model: accumulate while visible, flush on hide, reset to zero

Naively logging "elapsed time since the page loaded" every time the tab is
hidden produces duplicate, overlapping rows — a visitor who alt-tabs away and
back three times would generate three `page_time` rows, each measuring from
the *same* start point, so summing them wildly overcounts. Earlier versions
of this tracker had exactly that bug.

The fix: every timer (page, project, each section) tracks two things —
`accumulatedMs` (time banked so far) and `visibleSince` (a timestamp, or
`null` if not currently being watched):

- While the tab is visible and the thing is on screen, `visibleSince` is set
  and time is ticking.
- The moment the tab is hidden, a section scrolls out, or the page unloads,
  the elapsed time since `visibleSince` is added to `accumulatedMs`, and if
  that total is `> 0` it's queued as **one event** — then the accumulator
  **resets to zero**.
- If the visitor comes back, the timer starts fresh from zero. The *next*
  hide/unload sends a new row for that new segment, not a bigger overlapping
  number.

So a visitor who reads a page, tabs away, comes back, and closes the tab
might legitimately produce two `page_time` rows (e.g. 18s, then 12s) — that's
correct and expected, not a bug: it's two distinct viewing segments, and
`SUM(duration_ms)` across them gives the true total time spent, with no
double-counting. `section_time` works identically, using
`IntersectionObserver` (≥40% visible = "being watched") instead of tab
visibility as the on/off signal.

Deliberately **not** deduplicated with a database `UPSERT`/`ON DUPLICATE KEY
UPDATE` — that would silently overwrite the event log and throw away the
timeline (can't tell "read once for 30s" from "skimmed 3 times for 10s
each"), which matters more here than having a single tidy row per
session+page. The event-log table stays append-only; correctness is enforced
client-side instead, by only ever queuing non-overlapping segments.

### 3.4 The database: one table, on purpose

Rather than several normalized tables (sessions, pageviews, sections,
projects...), everything lands in one flat `events` table
(see `schema.sql`):

```sql
CREATE TABLE events (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id   VARCHAR(64)  NOT NULL,
  event_type   VARCHAR(20)  NOT NULL,   -- pageview | page_time | section_time | project_click | project_time
  page         VARCHAR(120) NOT NULL,
  section      VARCHAR(120) NULL,
  project_id   VARCHAR(120) NULL,
  duration_ms  INT UNSIGNED NULL,
  user_agent   VARCHAR(255) NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

This keeps the schema readable for a beginner: one table, one mental model
("a log of things that happened"), and every question can be answered with a
simple `GROUP BY`. For example:

```sql
-- Most viewed page
SELECT page, COUNT(*) AS views FROM events
WHERE event_type = 'pageview' GROUP BY page ORDER BY views DESC;

-- Page where people spend the most total time
SELECT page, SUM(duration_ms) AS total_ms FROM events
WHERE event_type = 'page_time' GROUP BY page ORDER BY total_ms DESC;

-- Section people linger on the most
SELECT section, SUM(duration_ms) AS total_ms FROM events
WHERE event_type = 'section_time' GROUP BY section ORDER BY total_ms DESC;

-- Most-viewed project (by time spent on its detail page)
SELECT project_id, SUM(duration_ms) AS total_ms FROM events
WHERE event_type = 'project_time' GROUP BY project_id ORDER BY total_ms DESC;
```

These exact queries (plus a couple more) power `stats.php`, which
`admin-stats.html` polls every 15 seconds to show a live view.

### 3.5 Where the `.env` file comes in

`config.php` reads MySQL credentials from a local `.env` file instead of
hardcoding them — with a small hand-written parser (no packages needed):

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=portfolio_user
DB_PASSWORD=change_me
DB_NAME=portfolio_tracking
```

`.env` is listed in `.gitignore` so real credentials never get committed —
only `.env.example` (with placeholder values) is checked in. `.htaccess`
also blocks any direct browser request for `.env` itself, in case the site
is served by Apache.

---

## 4. Running it locally

### 4.1 Prerequisites

- PHP 7.4+ with the `mysqli` extension (bundled with PHP by default)
- A MySQL server (local install, Docker, or a hosted instance)

### 4.2 Steps

```bash
# 1. Create the database + table
mysql -u root -p < schema.sql

# 2. Copy the env template and fill in your real MySQL credentials
cp .env.example .env
# then edit .env

# 3. Start PHP's built-in development server from the project folder
php -S localhost:8000
```

Open **http://localhost:8000** — that's the portfolio. Browse a few pages,
click a project card, wait a few seconds, then open
**http://localhost:8000/admin-stats.html** to see the tracked behaviour show
up (it refreshes automatically every 15 seconds).

For real hosting, just upload the whole folder to any PHP + MySQL host
(shared hosting, XAMPP, etc.) — there's no build step and nothing to compile.

### 4.3 Customizing the content

- Replace the name, bio, skills, and timeline in `index.html` / `about.html`.
- Swap the emoji `card-thumb` blocks and `chart-placeholder` blocks for real
  screenshots (Power BI report screenshots, exported matplotlib/Plotly
  charts) — just drop images into an `assets/` folder and update the
  `<img>` tags.
- Add more projects by copying an existing `project-*.html` file and adding
  a matching card + `data-project-click` id in `projects.html`.

---

## 5. Notes on production use

- `stats.php` is intentionally **unauthenticated** in this demo so it's
  easy to try out. Before deploying publicly, put it behind basic auth or an
  admin login, since it exposes visitor counts and timing data.
- The tracker never records personal data — no names, emails, or IP
  addresses are stored (only a random session id and the browser's user
  agent string).
- `track.php` uses a prepared statement (`mysqli::prepare` +
  `bind_param`), so tracking data is safe from SQL injection even though it
  comes straight from the browser.
- All tracking failures are swallowed silently on the client
  (`.catch(() => {})`) so a network hiccup or ad-blocker never breaks the
  actual portfolio experience.
