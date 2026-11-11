<?php

declare(strict_types=1);

const SESSION_COOKIE = '__Secure-lyra_session';
const SESSION_SECONDS = 2592000;

function current_session(PDO $db): ?array
{
    $token = $_COOKIE[SESSION_COOKIE] ?? null;

    if (!is_string($token)) {
        return null;
    }

    $stmt = $db->prepare(
        'SELECT p.user_id, p.passkey_id
         FROM sessions s
         JOIN passkeys p USING (passkey_id)
         WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP'
    );
    $stmt->execute([hash('sha256', $token)]);

    return $stmt->fetch() ?: null;
}

function require_session(PDO $db): array
{
    return current_session($db) ?? respond(401, ['error' => 'unauthorized']);
}

function start_session(PDO $db, int $passkey_id): void
{
    $token = bin2hex(random_bytes(32));

    $db->exec('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP');
    $db->prepare('INSERT INTO sessions (token_hash, passkey_id, expires_at) VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL ? SECOND)')
        ->execute([hash('sha256', $token), $passkey_id, SESSION_SECONDS]);

    set_session_cookie($token, time() + SESSION_SECONDS);
}

function end_session(PDO $db): void
{
    $token = $_COOKIE[SESSION_COOKIE] ?? null;

    if (is_string($token)) {
        $db->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    }

    set_session_cookie('', 1);
}

function set_session_cookie(string $value, int $expires): void
{
    setcookie(SESSION_COOKIE, $value, [
        'expires' => $expires,
        'path' => dirname($_SERVER['SCRIPT_NAME']),
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}