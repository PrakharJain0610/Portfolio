<?php
/**
 * config.php — loads DB credentials from .env and opens a MySQL connection.
 *
 * No Composer, no packages — just plain PHP reading a plain text file.
 * .env format (one per line, same as .env.example):
 *   DB_HOST=127.0.0.1
 *   DB_PORT=3306
 *   DB_USER=portfolio_user
 *   DB_PASSWORD=change_me
 *   DB_NAME=portfolio_tracking
 */

function load_env(string $path): array {
    $values = [];
    if (!file_exists($path)) {
        return $values;
    }
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $values[trim($key)] = trim($value);
    }
    return $values;
}

$env = load_env(__DIR__ . '/.env');

define('DB_HOST', $env['DB_HOST'] ?? '127.0.0.1');
define('DB_PORT', (int) ($env['DB_PORT'] ?? 3306));
define('DB_USER', $env['DB_USER'] ?? 'root');
define('DB_PASSWORD', $env['DB_PASSWORD'] ?? '');
define('DB_NAME', $env['DB_NAME'] ?? 'portfolio_tracking');

function get_db(): mysqli {
    $mysqli = mysqli_init();
    $ok = @$mysqli->real_connect(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT);
    if (!$ok) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'database connection failed']);
        exit;
    }
    return $mysqli;
}
