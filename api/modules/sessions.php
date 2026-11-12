<?php

declare(strict_types=1);

function list_sessions(): never
{
    $db = get_db();
    $session = require_session($db);

    $stmt = $db->prepare(
        'SELECT s.session_id, s.user_agent, s.created_at, s.last_used_at, p.name
         FROM sessions s
         JOIN passkeys p USING (passkey_id)
         WHERE p.user_id = ? AND s.expires_at > CURRENT_TIMESTAMP
         ORDER BY s.last_used_at DESC, s.session_id DESC'
    );
    $stmt->execute([$session['user_id']]);
    $sessions = [];

    foreach ($stmt as $row) {
        $sessions[] = [
            'id' => $row['session_id'],
            'user_agent' => $row['user_agent'],
            'passkey' => $row['name'],
            'created_at' => iso_time($row['created_at']),
            'last_used_at' => iso_time($row['last_used_at']),
            'current' => $row['session_id'] === $session['session_id'],
        ];
    }

    respond(200, ['sessions' => $sessions]);
}

function delete_session(string $id): never
{
    require_website_origin();
    $db = get_db();
    $session = require_session($db);
    $session_id = filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

    $stmt = $db->prepare('DELETE s FROM sessions s JOIN passkeys p USING (passkey_id) WHERE s.session_id = ? AND p.user_id = ?');
    $stmt->execute([$session_id === false ? 0 : $session_id, $session['user_id']]);

    if ($stmt->rowCount() === 0) {
        respond(404, ['error' => 'not found']);
    }

    if ($session_id === $session['session_id']) {
        set_session_cookie('', 1);
    }

    respond_empty();
}

return [
    '/sessions' => ['GET' => 'list_sessions'],
    '/sessions/{id}' => ['DELETE' => 'delete_session'],
];