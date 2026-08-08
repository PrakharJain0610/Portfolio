<?php
/**
 * track.php — receives a batch of tracking events from js/tracker.js and
 * inserts them into the `events` MySQL table (see schema.sql).
 *
 * Expected JSON body: { "events": [ { event_type, page, section,
 *   project_id, duration_ms, session_id }, ... ] }
 */

require __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$events = is_array($body['events'] ?? null) ? $body['events'] : [];

if (empty($events)) {
    http_response_code(400);
    echo json_encode(['error' => 'events array is required']);
    exit;
}

$allowedTypes = ['pageview', 'page_time', 'section_time', 'project_click', 'project_time'];
$userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);

$mysqli = get_db();
$stmt = $mysqli->prepare(
    'INSERT INTO events (session_id, event_type, page, section, project_id, duration_ms, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)'
);

$inserted = 0;
foreach ($events as $e) {
    if (!is_array($e)) continue;
    $sessionId = substr((string) ($e['session_id'] ?? ''), 0, 64);
    $eventType = (string) ($e['event_type'] ?? '');
    $page = substr((string) ($e['page'] ?? ''), 0, 120);

    if ($sessionId === '' || $page === '' || !in_array($eventType, $allowedTypes, true)) {
        continue;
    }

    $section = isset($e['section']) ? substr((string) $e['section'], 0, 120) : null;
    $projectId = isset($e['project_id']) ? substr((string) $e['project_id'], 0, 120) : null;
    $durationMs = isset($e['duration_ms']) && is_numeric($e['duration_ms'])
        ? max(0, (int) round($e['duration_ms']))
        : null;

    $stmt->bind_param(
        'sssssis',
        $sessionId,
        $eventType,
        $page,
        $section,
        $projectId,
        $durationMs,
        $userAgent
    );
    $stmt->execute();
    $inserted++;
}

$stmt->close();
$mysqli->close();

if ($inserted === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'no valid events in batch']);
    exit;
}

http_response_code(204);
