<?php

declare(strict_types=1);

const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'];

function read_settings(PDO $db, int $user_id): array
{
    $stmt = $db->prepare('SELECT temperature_unit, time_zone FROM users WHERE user_id = ?');
    $stmt->execute([$user_id]);

    return $stmt->fetch();
}

function get_settings(): never
{
    $db = get_db();
    $session = require_session($db);

    respond(200, read_settings($db, $session['user_id']));
}

function update_settings(): never
{
    require_website_origin();
    $db = get_db();
    $session = require_session($db);
    $data = read_json();

    if (array_key_exists('temperature_unit', $data) && !in_array($data['temperature_unit'], TEMPERATURE_UNITS, true)) {
        respond(400, ['error' => 'temperature_unit must be one of: ' . implode(', ', TEMPERATURE_UNITS)]);
    }

    if (array_key_exists('time_zone', $data) && $data['time_zone'] !== null && !in_array($data['time_zone'], DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true)) {
        respond(400, ['error' => 'time_zone must be an IANA time zone, or null to follow the browser']);
    }

    $current = read_settings($db, $session['user_id']);
    $settings = array_intersect_key($data, $current) + $current;
    $db->prepare('UPDATE users SET temperature_unit = ?, time_zone = ? WHERE user_id = ?')->execute([$settings['temperature_unit'], $settings['time_zone'], $session['user_id']]);
    respond_empty();
}

return [
    '/settings' => ['GET' => 'get_settings', 'PATCH' => 'update_settings'],
];