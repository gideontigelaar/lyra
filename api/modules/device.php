<?php

declare(strict_types=1);

const MAX_ADVERTS = 100;
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

    $stmt = $db->prepare(
        'SELECT s.address, MIN(IF(sm.is_active, sm.report_interval, NULL)) AS relay
         FROM sensors s
         LEFT JOIN sensor_metrics sm USING (sensor_id)
         WHERE s.device_id = ?
         GROUP BY s.sensor_id
         ORDER BY s.sensor_id'
    );
    $stmt->execute([$device_id]);
    $sensors = [];

    foreach ($stmt as $row) {
        $sensors[] = ['address' => $row['address'], 'interval' => $row['relay'] ?? RELAY_SECONDS];
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

return [
    '/device/sensors' => ['GET' => 'list_device_sensors'],
    '/device/adverts' => ['POST' => 'store_adverts'],
];