<?php

declare(strict_types=1);

const SESSION_COOKIE = '__Secure-lyra_session';
const SESSION_SECONDS = 2592000;
const SESSION_TOUCH_SECONDS = 300;

function user_agent(): ?string
{
    $agent = $_SERVER['HTTP_USER_AGENT'] ?? '';

    return $agent === '' ? null : mb_substr(mb_scrub($agent, 'UTF-8'), 0, 255);
}

function current_session(PDO $db): ?array
{
    $token = $_COOKIE[SESSION_COOKIE] ?? null;

    if (!is_string($token)) {
        return null;
    }

    $stmt = $db->prepare(
        'SELECT s.session_id, p.user_id, p.passkey_id, s.last_used_at > CURRENT_TIMESTAMP - INTERVAL ? SECOND AS recent
         FROM sessions s
         JOIN passkeys p USING (passkey_id)
         WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP'
    );
    $stmt->execute([SESSION_TOUCH_SECONDS, hash('sha256', $token)]);
    $session = $stmt->fetch();

    if ($session !== false && !$session['recent']) {
        $db->prepare('UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP, user_agent = ? WHERE session_id = ?')->execute([user_agent(), $session['session_id']]);
    }

    return $session ?: null;
}

function require_session(PDO $db): array
{
    return current_session($db) ?? respond(401, ['error' => 'unauthorized']);
}

function start_session(PDO $db, int $passkey_id): void
{
    $token = bin2hex(random_bytes(32));

    $db->exec('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP');
    $db->prepare('INSERT INTO sessions (token_hash, passkey_id, user_agent, expires_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP + INTERVAL ? SECOND)')
        ->execute([hash('sha256', $token), $passkey_id, user_agent(), SESSION_SECONDS]);

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