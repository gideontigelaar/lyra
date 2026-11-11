<?php

declare(strict_types=1);

const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'];

function get_settings(): never
{
    $db = get_db();
    $session = require_session($db);

    $stmt = $db->prepare('SELECT temperature_unit FROM users WHERE user_id = ?');
    $stmt->execute([$session['user_id']]);

    respond(200, $stmt->fetch());
}

function update_settings(): never
{
    require_website_origin();
    $db = get_db();
    $session = require_session($db);
    $unit = read_json()['temperature_unit'] ?? null;

    if (!in_array($unit, TEMPERATURE_UNITS, true)) {
        respond(400, ['error' => 'temperature_unit must be one of: ' . implode(', ', TEMPERATURE_UNITS)]);
    }

    $db->prepare('UPDATE users SET temperature_unit = ? WHERE user_id = ?')->execute([$unit, $session['user_id']]);
    respond_empty();
}

return [
    '/settings' => ['GET' => 'get_settings', 'PATCH' => 'update_settings'],
];