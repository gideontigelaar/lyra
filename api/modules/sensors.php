<?php

declare(strict_types=1);

const MIN_INTERVAL = 60;
const MAX_INTERVAL = 86400;

function find_sensor(PDO $db, string $id): array
{
    $stmt = $db->prepare('SELECT sensor_id, name, address, decoder, device_id FROM sensors WHERE sensor_id = ?');
    $stmt->execute([ctype_digit($id) ? $id : 0]);

    return $stmt->fetch() ?: respond(404, ['error' => 'not found']);
}

function read_device_id(PDO $db, mixed $value): ?int
{
    if ($value === null) {
        return null;
    }

    $stmt = $db->prepare('SELECT device_id FROM devices WHERE device_id = ?');
    $stmt->execute([is_int($value) ? $value : 0]);

    return $stmt->fetchColumn() ?: respond(400, ['error' => 'unknown source']);
}

function list_sensors(): never
{
    $db = get_db();
    require_session($db);

    $latest = [];
    $stmt = $db->query(
        'SELECT r.sensor_id, r.metric_id, r.value, r.measured_at
         FROM (SELECT sensor_id, metric_id, MAX(measured_at) AS measured_at FROM readings GROUP BY sensor_id, metric_id) l
         JOIN readings r USING (sensor_id, metric_id, measured_at)'
    );

    foreach ($stmt as $row) {
        $latest[$row['sensor_id']][$row['metric_id']] = ['value' => $row['value'], 'measured_at' => iso_time($row['measured_at'])];
    }

    $metrics = [];
    $stmt = $db->query(
        'SELECT sm.sensor_id, sm.metric_id, m.name, m.unit, sm.report_interval, sm.is_active
         FROM sensor_metrics sm
         JOIN metrics m USING (metric_id)
         ORDER BY sm.metric_id'
    );

    foreach ($stmt as $row) {
        $metrics[$row['sensor_id']][] = [
            'name' => $row['name'],
            'unit' => $row['unit'],
            'interval' => $row['report_interval'],
            'active' => (bool) $row['is_active'],
            'latest' => $latest[$row['sensor_id']][$row['metric_id']] ?? null,
        ];
    }

    $sinks = [];

    foreach ($db->query('SELECT sensor_id, sink FROM sensor_sinks ORDER BY sink') as $row) {
        $sinks[$row['sensor_id']][] = $row['sink'];
    }

    $sensors = [];

    foreach ($db->query('SELECT sensor_id, name, address, decoder, device_id FROM sensors ORDER BY name') as $row) {
        $sensors[] = [
            'id' => $row['sensor_id'],
            'name' => $row['name'],
            'address' => $row['address'],
            'decoder' => $row['decoder'],
            'device' => $row['device_id'],
            'metrics' => $metrics[$row['sensor_id']] ?? [],
            'sinks' => $sinks[$row['sensor_id']] ?? [],
        ];
    }

    respond(200, ['sensors' => $sensors]);
}

function create_sensor(): never
{
    require_website_origin();
    $db = get_db();
    require_session($db);
    $data = read_json();

    $name = read_name($data['name'] ?? null);
    $address = is_string($data['address'] ?? null) ? strtoupper($data['address']) : '';
    $decoder = $data['decoder'] ?? null;

    if (!preg_match(MAC_PATTERN, $address)) {
        respond(400, ['error' => 'address must be a MAC address like A4:C1:38:00:00:00']);
    }

    if (!in_array($decoder, DECODERS, true)) {
        respond(400, ['error' => 'unknown decoder']);
    }

    $device_id = read_device_id($db, $data['device'] ?? null);

    $db->beginTransaction();
    on_duplicate(
        fn() => $db->prepare('INSERT INTO sensors (device_id, address, name, decoder) VALUES (?, ?, ?, ?)')->execute([$device_id, $address, $name, $decoder]),
        'a sensor with this name or address already exists',
    );
    $id = (int) $db->lastInsertId();
    $db->prepare("INSERT INTO sensor_sinks (sensor_id, sink) VALUES (?, 'lyra')")->execute([$id]);
    $db->commit();

    respond(201, ['id' => $id]);
}

function update_sensor(string $id): never
{
    require_website_origin();
    $db = get_db();
    require_session($db);
    $sensor = find_sensor($db, $id);
    $data = read_json();
    $db->beginTransaction();

    if (array_key_exists('name', $data)) {
        $name = read_name($data['name']);
        on_duplicate(fn() => $db->prepare('UPDATE sensors SET name = ? WHERE sensor_id = ?')->execute([$name, $sensor['sensor_id']]), 'a sensor with this name already exists');
    }

    if (array_key_exists('device', $data)) {
        $db->prepare('UPDATE sensors SET device_id = ? WHERE sensor_id = ?')->execute([read_device_id($db, $data['device']), $sensor['sensor_id']]);
    }

    if (array_key_exists('metrics', $data)) {
        if (!is_array($data['metrics']) || array_is_list($data['metrics'])) {
            respond(400, ['error' => 'metrics must map metric names to changes']);
        }

        $find = $db->prepare('SELECT metric_id FROM sensor_metrics JOIN metrics USING (metric_id) WHERE sensor_id = ? AND name = ?');

        foreach ($data['metrics'] as $metric => $change) {
            $find->execute([$sensor['sensor_id'], $metric]);
            $metric_id = $find->fetchColumn() ?: respond(400, ['error' => "unknown metric: $metric"]);
            $interval = $change['interval'] ?? null;
            $active = $change['active'] ?? null;

            if (!is_array($change) || ($interval !== null && (!is_int($interval) || $interval < MIN_INTERVAL || $interval > MAX_INTERVAL)) || ($active !== null && !is_bool($active))) {
                respond(400, ['error' => 'interval must be ' . MIN_INTERVAL . ' to ' . MAX_INTERVAL . ' seconds and active a boolean']);
            }

            $db->prepare('UPDATE sensor_metrics SET report_interval = COALESCE(?, report_interval), is_active = COALESCE(?, is_active) WHERE sensor_id = ? AND metric_id = ?')
                ->execute([$interval, $active === null ? null : (int) $active, $sensor['sensor_id'], $metric_id]);
        }
    }

    if (array_key_exists('sinks', $data)) {
        $sinks = $data['sinks'];

        if (!is_array($sinks) || !array_is_list($sinks) || array_diff($sinks, SINKS) !== [] || count(array_unique($sinks)) !== count($sinks)) {
            respond(400, ['error' => 'sinks must be a list of: ' . implode(', ', SINKS)]);
        }

        $db->prepare('DELETE FROM sensor_sinks WHERE sensor_id = ?')->execute([$sensor['sensor_id']]);
        $insert = $db->prepare('INSERT INTO sensor_sinks (sensor_id, sink) VALUES (?, ?)');

        foreach ($sinks as $sink) {
            $insert->execute([$sensor['sensor_id'], $sink]);
        }
    }

    $db->commit();
    respond_empty();
}

function delete_sensor(string $id): never
{
    require_website_origin();
    $db = get_db();
    require_session($db);
    $sensor = find_sensor($db, $id);

    $db->prepare('DELETE FROM sensors WHERE sensor_id = ?')->execute([$sensor['sensor_id']]);
    respond_empty();
}

function list_decoders(): never
{
    require_session(get_db());
    respond(200, ['decoders' => plugin_list('decoders', DECODERS)]);
}

function list_sinks(): never
{
    require_session(get_db());
    respond(200, ['sinks' => plugin_list('sinks', SINKS)]);
}

return [
    '/sensors' => ['GET' => 'list_sensors', 'POST' => 'create_sensor'],
    '/sensors/{id}' => ['PATCH' => 'update_sensor', 'DELETE' => 'delete_sensor'],
    '/decoders' => ['GET' => 'list_decoders'],
    '/sinks' => ['GET' => 'list_sinks'],
];