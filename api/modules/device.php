<?php

declare(strict_types=1);

const MAX_AGE_SECONDS = 604800;

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

return [
    '/device/sensors' => ['GET' => 'list_device_sensors'],
    '/readings' => ['POST' => 'store_readings'],
];