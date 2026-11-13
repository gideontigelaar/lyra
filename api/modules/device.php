<?php

declare(strict_types=1);

const MAX_ADVERTS = 100;
const MAX_AGE_SECONDS = 604800;
const TELEMETRY_NUMBERS = [
    'uptime' => [0, 4294967295],
    'boots' => [1, 4294967295],
    'rssi' => [-127, 0],
    'wifi_reconnects' => [0, 4294967295],
    'free_heap' => [0, 4294967295],
    'min_free_heap' => [0, 4294967295],
    'largest_block' => [0, 4294967295],
    'temperature' => [-40, 125],
    'pending' => [0, 65535],
    'dropped' => [0, 4294967295],
];
const RESET_REASONS = [
    'unknown', 'power_on', 'external', 'software', 'panic', 'interrupt_watchdog', 'task_watchdog', 'watchdog',
    'deep_sleep', 'brownout', 'sdio', 'usb', 'jtag', 'efuse', 'power_glitch', 'cpu_lockup',
];

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

    $stmt = $db->prepare(
        'SELECT s.address, MAX(sm.is_active) AS active, MIN(IF(sm.is_active, sm.report_interval, NULL)) AS shortest
         FROM sensors s
         LEFT JOIN sensor_metrics sm USING (sensor_id)
         WHERE s.device_id = ?
         GROUP BY s.sensor_id
         ORDER BY s.sensor_id'
    );
    $stmt->execute([$device_id]);
    $sensors = [];

    // While the API can't be reached, a source keeps each kind of broadcast once per offline interval, the shortest recording interval.
    foreach ($stmt as $row) {
        $sensors[] = [
            'address' => $row['address'],
            'interval' => $row['active'] !== null && !$row['active'] ? IDLE_RELAY_SECONDS : RELAY_SECONDS,
            'offline_interval' => $row['shortest'] ?? IDLE_RELAY_SECONDS,
        ];
    }

    respond(200, ['sensors' => $sensors]);
}

function store_adverts(): never
{
    $db = get_db();
    $device_id = authenticate_device($db);
    $adverts = read_json()['adverts'] ?? null;

    if (!is_array($adverts) || !array_is_list($adverts) || $adverts === [] || count($adverts) > MAX_ADVERTS) {
        respond(400, ['error' => 'expected 1 to ' . MAX_ADVERTS . ' adverts']);
    }

    foreach ($adverts as $advert) {
        $valid = is_array($advert)
            && is_string($advert['address'] ?? null) && preg_match(MAC_PATTERN, strtoupper($advert['address']))
            && is_string($advert['data'] ?? null) && preg_match('/^(?:[0-9A-Fa-f]{2}){1,255}$/', $advert['data'])
            && is_int($advert['age'] ?? null) && $advert['age'] >= 0 && $advert['age'] <= MAX_AGE_SECONDS;

        if (!$valid) {
            respond(400, ['error' => 'each advert needs an address, hex data and an age in seconds']);
        }
    }

    $stmt = $db->prepare('SELECT sensor_id, address, decoder FROM sensors WHERE device_id = ?');
    $stmt->execute([$device_id]);
    $sensors = array_column($stmt->fetchAll(), null, 'address');
    $stored = 0;

    $db->beginTransaction();

    foreach ($adverts as $advert) {
        $sensor = $sensors[strtoupper($advert['address'])] ?? null;

        if ($sensor !== null) {
            $stored += ingest_advert($db, $sensor, hex2bin($advert['data']), time() - $advert['age']);
        }
    }

    $db->commit();

    respond(200, ['stored' => $stored]);
}

function store_telemetry(): never
{
    $db = get_db();
    $device_id = authenticate_device($db);
    $data = read_json();
    $telemetry = [];

    foreach (TELEMETRY_NUMBERS as $field => [$min, $max]) {
        if (!array_key_exists($field, $data)) {
            continue;
        }

        $value = $data[$field];

        if (!(is_int($value) || ($field === 'temperature' && is_float($value))) || $value < $min || $value > $max) {
            respond(400, ['error' => "$field must be a number from $min to $max"]);
        }

        $telemetry[$field] = $field === 'temperature' ? round($value, 1) : $value;
    }

    if (array_key_exists('reset_reason', $data)) {
        if (!in_array($data['reset_reason'], RESET_REASONS, true)) {
            respond(400, ['error' => 'reset_reason must be one of: ' . implode(', ', RESET_REASONS)]);
        }

        $telemetry['reset_reason'] = $data['reset_reason'];
    }

    if (array_key_exists('build', $data)) {
        if (!is_string($data['build']) || !preg_match('/^[\x20-\x7E]{1,40}$/', $data['build'])) {
            respond(400, ['error' => 'build must be up to 40 printable characters']);
        }

        $telemetry['build'] = $data['build'];
    }

    $stmt = $db->prepare('SELECT telemetry FROM devices WHERE device_id = ?');
    $stmt->execute([$device_id]);
    $previous = $stmt->fetchColumn();
    $counts = count_changes($previous === null ? null : json_decode($previous, true, 4, JSON_THROW_ON_ERROR), $telemetry);

    $db->beginTransaction();
    $db->prepare('UPDATE devices SET telemetry = ?, telemetry_at = CURRENT_TIMESTAMP WHERE device_id = ?')
        ->execute([json_encode($telemetry, JSON_UNESCAPED_SLASHES), $device_id]);

    if (array_sum($counts) > 0) {
        $db->prepare(
            'INSERT INTO device_counts (device_id, day, restarts, wifi_reconnects, dropped) VALUES (?, UTC_DATE(), ?, ?, ?)
             ON DUPLICATE KEY UPDATE restarts = restarts + VALUES(restarts), wifi_reconnects = wifi_reconnects + VALUES(wifi_reconnects), dropped = dropped + VALUES(dropped)'
        )->execute([$device_id, $counts['restarts'], $counts['wifi_reconnects'], $counts['dropped']]);
    }

    $db->prepare('DELETE FROM device_counts WHERE device_id = ? AND day <= UTC_DATE() - INTERVAL ' . COUNT_DAYS . ' DAY')->execute([$device_id]);
    $db->commit();

    respond_empty();
}

// What happened since a source's previous report. Its boot count only goes up, and its reconnects and dropped broadcasts
// count from its last restart, so they become counts per day that only say what happened lately.
function count_changes(?array $previous, array $report): array
{
    $counts = ['restarts' => 0, 'wifi_reconnects' => 0, 'dropped' => 0];

    if ($previous === null) {
        return $counts;
    }

    $restarted = isset($report['boots'], $previous['boots'])
        ? $report['boots'] !== $previous['boots']
        : isset($report['uptime'], $previous['uptime']) && $report['uptime'] < $previous['uptime'];

    if ($restarted) {
        $counts['restarts'] = isset($report['boots'], $previous['boots']) && $report['boots'] > $previous['boots'] ? $report['boots'] - $previous['boots'] : 1;
    }

    foreach (['wifi_reconnects', 'dropped'] as $field) {
        if (isset($report[$field])) {
            $counts[$field] = $restarted ? $report[$field] : max(0, $report[$field] - ($previous[$field] ?? 0));
        }
    }

    return $counts;
}

return [
    '/device/sensors' => ['GET' => 'list_device_sensors'],
    '/device/adverts' => ['POST' => 'store_adverts'],
    '/device/telemetry' => ['POST' => 'store_telemetry'],
];