<?php

declare(strict_types=1);

const MAX_CARDS = 100;

function get_dashboard(): never
{
    $db = get_db();
    $session = require_session($db);

    $stmt = $db->prepare('SELECT dashboard FROM users WHERE user_id = ?');
    $stmt->execute([$session['user_id']]);
    $dashboard = $stmt->fetchColumn();

    respond(200, ['cards' => $dashboard === null ? null : json_decode($dashboard, true, 8, JSON_THROW_ON_ERROR)]);
}

function save_dashboard(): never
{
    require_website_origin();
    $db = get_db();
    $session = require_session($db);
    $cards = read_json()['cards'] ?? null;

    if (!is_array($cards) || !array_is_list($cards) || count($cards) > MAX_CARDS) {
        respond(400, ['error' => 'cards must be a list of at most ' . MAX_CARDS . ' cards']);
    }

    foreach ($cards as $card) {
        if (!is_array($card) || !is_string($card['type'] ?? null)) {
            respond(400, ['error' => 'every card needs a type']);
        }
    }

    $db->prepare('UPDATE users SET dashboard = ? WHERE user_id = ?')
        ->execute([json_encode($cards, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $session['user_id']]);

    respond(200, ['cards' => $cards]);
}

function reset_dashboard(): never
{
    require_website_origin();
    $db = get_db();
    $session = require_session($db);

    $db->prepare('UPDATE users SET dashboard = NULL WHERE user_id = ?')->execute([$session['user_id']]);
    respond_empty();
}

return [
    '/dashboard' => ['GET' => 'get_dashboard', 'PUT' => 'save_dashboard', 'DELETE' => 'reset_dashboard'],
];