<?php

declare(strict_types=1);

function find_device(PDO $db, string $id): array
{
    $stmt = $db->prepare('SELECT device_id, name FROM devices WHERE device_id = ?');
    $stmt->execute([ctype_digit($id) ? $id : 0]);

    return $stmt->fetch() ?: respond(404, ['error' => 'not found']);
}

function new_device_key(): array
{
    $key = bin2hex(random_bytes(32));

    return [$key, hash('sha256', $key)];
}

function list_devices(): never
{
    $db = get_db();
    require_session($db);

    $sensors = [];

    foreach ($db->query('SELECT device_id, sensor_id FROM sensors WHERE device_id IS NOT NULL ORDER BY name') as $row) {
        $sensors[$row['device_id']][] = $row['sensor_id'];
    }

    $devices = [];

    foreach ($db->query('SELECT device_id, name, is_active, last_seen_at FROM devices ORDER BY name') as $row) {
        $devices[] = [
            'id' => $row['device_id'],
            'name' => $row['name'],
            'active' => (bool) $row['is_active'],
            'last_seen_at' => iso_time($row['last_seen_at']),
            'sensors' => $sensors[$row['device_id']] ?? [],
        ];
    }

    respond(200, ['devices' => $devices]);
}

function create_device(): never
{
    require_website_origin();
    $db = get_db();
    require_session($db);
    $name = read_name(read_json()['name'] ?? null);
    [$key, $hash] = new_device_key();

    on_duplicate(fn() => $db->prepare('INSERT INTO devices (name, api_key_hash) VALUES (?, ?)')->execute([$name, $hash]), 'a source with this name already exists');

    respond(201, ['id' => (int) $db->lastInsertId(), 'key' => $key]);
}

function update_device(string $id): never
{
    require_website_origin();
    $db = get_db();
    require_session($db);
    $device = find_device($db, $id);
    $data = read_json();

    if (array_key_exists('active', $data) && !is_bool($data['active'])) {
        respond(400, ['error' => 'active must be a boolean']);
    }

    $name = array_key_exists('name', $data) ? read_name($data['name']) : $device['name'];
    $active = $data['active'] ?? null;

    on_duplicate(
        fn() => $db->prepare('UPDATE devices SET name = ?, is_active = COALESCE(?, is_active) WHERE device_id = ?')->execute([$name, $active === null ? null : (int) $active, $device['device_id']]),
        'a source with this name already exists',
    );

    respond_empty();
}

function replace_device_key(string $id): never
{
    require_website_origin();
    $db = get_db();
    require_session($db);
    $device = find_device($db, $id);
    [$key, $hash] = new_device_key();

    $db->prepare('UPDATE devices SET api_key_hash = ? WHERE device_id = ?')->execute([$hash, $device['device_id']]);

    respond(200, ['key' => $key]);
}

function delete_device(string $id): never
{
    require_website_origin();
    $db = get_db();
    require_session($db);
    $device = find_device($db, $id);

    $db->prepare('DELETE FROM devices WHERE device_id = ?')->execute([$device['device_id']]);
    respond_empty();
}

return [
    '/devices' => ['GET' => 'list_devices', 'POST' => 'create_device'],
    '/devices/{id}' => ['PATCH' => 'update_device', 'DELETE' => 'delete_device'],
    '/devices/{id}/key' => ['POST' => 'replace_device_key'],
];