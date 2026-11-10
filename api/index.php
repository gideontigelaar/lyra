<?php

declare(strict_types=1);

set_exception_handler(function (Throwable $e): void {
    error_log((string) $e);
    respond(500, ['error' => 'internal server error']);
});

const MAX_BODY_BYTES = 65536;
const MAX_AGE_SECONDS = 604800;

function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
    exit;
}

function get_db(): PDO
{
    static $db = null;

    if ($db === null) {
        $creds = json_decode(file_get_contents(__DIR__ . '/creds.json'), true, 2, JSON_THROW_ON_ERROR);

        $db = new PDO(
            "mysql:host=localhost;dbname={$creds['database']};charset=utf8mb4",
            $creds['username'],
            $creds['password'],
            [PDO::ATTR_EMULATE_PREPARES => false],
        );

        $db->exec("SET time_zone = '+00:00'");
    }

    return $db;
}

function read_json(): array
{
    try {
        $data = json_decode(file_get_contents('php://input', length: MAX_BODY_BYTES), true, 8, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        respond(400, ['error' => 'invalid json']);
    }

    if (!is_array($data) || array_is_list($data)) {
        respond(400, ['error' => 'expected a json object']);
    }

    return $data;
}

function authenticate_device(PDO $db): int
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (!preg_match('/^Bearer (\S+)$/', $header, $match)) {
        header('WWW-Authenticate: Bearer');
        respond(401, ['error' => 'unauthorized']);
    }

    $stmt = $db->prepare('SELECT device_id FROM devices WHERE api_key_hash = ? AND is_active = 1');
    $stmt->execute([hash('sha256', $match[1])]);
    $device_id = $stmt->fetchColumn();

    if ($device_id === false) {
        header('WWW-Authenticate: Bearer');
        respond(401, ['error' => 'unauthorized']);
    }

    $db->prepare('UPDATE devices SET last_seen_at = CURRENT_TIMESTAMP WHERE device_id = ?')->execute([$device_id]);

    return (int) $device_id;
}

function health_check(): never
{
    respond(200, [
        'service' => 'lyra-api',
        'status' => 'online',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
    ]);
}

function list_device_sensors(): never
{
    $db = get_db();
    $device_id = authenticate_device($db);

    $stmt = $db->prepare('SELECT address, name FROM sensors WHERE device_id = ? ORDER BY sensor_id');
    $stmt->execute([$device_id]);

    respond(200, ['sensors' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function store_readings(): never
{
    $db = get_db();
    $device_id = authenticate_device($db);
    $data = read_json();

    $address = $data['sensor'] ?? null;
    $readings = $data['readings'] ?? null;
    $age = $data['age'] ?? 0;

    if (!is_string($address) || !is_array($readings) || $readings === [] || array_is_list($readings)) {
        respond(400, ['error' => 'expected sensor and readings']);
    }

    if (!is_int($age) || $age < 0 || $age > MAX_AGE_SECONDS) {
        respond(400, ['error' => 'age must be between 0 and ' . MAX_AGE_SECONDS . ' seconds']);
    }

    $stmt = $db->prepare('SELECT sensor_id FROM sensors WHERE address = ? AND device_id = ?');
    $stmt->execute([$address, $device_id]);
    $sensor_id = $stmt->fetchColumn();

    if ($sensor_id === false) {
        respond(400, ['error' => "unknown sensor: $address"]);
    }

    $metrics = $db->query('SELECT name, metric_id FROM metrics')->fetchAll(PDO::FETCH_KEY_PAIR);

    foreach ($readings as $metric => $value) {
        if (!isset($metrics[$metric])) {
            respond(400, ['error' => "unknown metric: $metric"]);
        }

        if (!(is_int($value) || is_float($value)) || !is_finite($value)) {
            respond(400, ['error' => "$metric must be a number"]);
        }
    }

    $insert = $db->prepare(
        'INSERT INTO readings (sensor_id, metric_id, value, measured_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP - INTERVAL ? SECOND)
         ON DUPLICATE KEY UPDATE value = VALUE(value)'
    );

    $db->beginTransaction();

    foreach ($readings as $metric => $value) {
        $insert->execute([$sensor_id, $metrics[$metric], $value, $age]);
    }

    $db->commit();

    respond(201, ['status' => 'ok', 'inserted' => count($readings)]);
}

$routes = [
    '/' => ['GET' => 'health_check'],
    '/device/sensors' => ['GET' => 'list_device_sensors'],
    '/readings' => ['POST' => 'store_readings'],
];

$base = dirname($_SERVER['SCRIPT_NAME']);
$uri = explode('?', $_SERVER['REQUEST_URI'], 2)[0];
$path = '/' . trim(substr($uri, strlen($base)), '/');

$methods = $routes[$path] ?? respond(404, ['error' => 'not found']);
$handler = $methods[$_SERVER['REQUEST_METHOD']] ?? null;

if ($handler === null) {
    header('Allow: ' . implode(', ', array_keys($methods)));
    respond(405, ['error' => 'method not allowed']);
}

$handler();