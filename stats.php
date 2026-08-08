<?php
/**
 * stats.php — read-only aggregate queries over the `events` table, used by
 * admin-stats.html / js/admin.js to show live visitor behaviour.
 *
 * NOTE: unauthenticated for demo simplicity — see README.md for how to
 * protect this before deploying for real.
 */

require __DIR__ . '/config.php';

header('Content-Type: application/json');

$mysqli = get_db();

function rows(mysqli $mysqli, string $sql): array {
    $result = $mysqli->query($sql);
    $out = [];
    while ($row = $result->fetch_assoc()) {
        $out[] = $row;
    }
    return $out;
}

$totals = $mysqli->query(
    "SELECT
       COUNT(DISTINCT session_id) AS visitors,
       SUM(event_type = 'pageview') AS pageviews
     FROM events"
)->fetch_assoc();

$topPages = rows($mysqli,
    "SELECT page, COUNT(*) AS views
     FROM events WHERE event_type = 'pageview'
     GROUP BY page ORDER BY views DESC LIMIT 10"
);

$timePerPage = rows($mysqli,
    "SELECT page, SUM(duration_ms) AS total_ms, ROUND(AVG(duration_ms)) AS avg_ms
     FROM events WHERE event_type = 'page_time'
     GROUP BY page ORDER BY total_ms DESC LIMIT 10"
);

$timePerSection = rows($mysqli,
    "SELECT section, SUM(duration_ms) AS total_ms
     FROM events WHERE event_type = 'section_time' AND section IS NOT NULL
     GROUP BY section ORDER BY total_ms DESC LIMIT 10"
);

$topProjects = rows($mysqli,
    "SELECT project_id,
            SUM(event_type = 'project_click') AS clicks,
            SUM(CASE WHEN event_type = 'project_time' THEN duration_ms ELSE 0 END) AS total_ms
     FROM events WHERE project_id IS NOT NULL
     GROUP BY project_id ORDER BY total_ms DESC, clicks DESC LIMIT 10"
);

$recentEvents = rows($mysqli,
    "SELECT event_type, page, section, project_id, duration_ms, created_at
     FROM events ORDER BY created_at DESC LIMIT 20"
);

echo json_encode([
    'visitors' => (int) ($totals['visitors'] ?? 0),
    'pageviews' => (int) ($totals['pageviews'] ?? 0),
    'topPages' => $topPages,
    'timePerPage' => $timePerPage,
    'timePerSection' => $timePerSection,
    'topProjects' => $topProjects,
    'recentEvents' => $recentEvents,
]);

$mysqli->close();
