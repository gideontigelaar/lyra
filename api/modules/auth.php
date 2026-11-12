<?php

declare(strict_types=1);

use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\CredentialRecord;
use Webauthn\Exception\WebauthnException;
use Webauthn\PublicKeyCredentialRequestOptions;

function login_options(string $challenge): PublicKeyCredentialRequestOptions
{
    return PublicKeyCredentialRequestOptions::create(
        $challenge,
        webauthn_rp_id(),
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_REQUIRED,
        timeout: CHALLENGE_SECONDS * 1000,
    );
}

function create_login_options(): never
{
    require_website_origin();
    $db = get_db();

    respond(200, webauthn_options(login_options(create_challenge($db, null))));
}

function log_in(): never
{
    require_website_origin();
    $db = get_db();
    $credential = read_credential(read_json());
    $response = $credential->response;

    if (!$response instanceof AuthenticatorAssertionResponse) {
        respond(400, ['error' => 'invalid credential']);
    }

    $challenge = $response->clientDataJSON->challenge;
    consume_challenge($db, $challenge, null);

    $stmt = $db->prepare('SELECT passkey_id, record FROM passkeys WHERE credential_id = ?');
    $stmt->execute([$credential->rawId]);
    $passkey = $stmt->fetch() ?: respond(401, ['error' => 'unknown passkey']);

    try {
        $record = AuthenticatorAssertionResponseValidator::create(webauthn_ceremonies()->requestCeremony())->check(
            webauthn_serializer()->deserialize($passkey['record'], CredentialRecord::class, 'json'),
            $response,
            login_options($challenge),
            webauthn_rp_id(),
            $response->userHandle,
        );
    } catch (WebauthnException) {
        respond(401, ['error' => 'passkey verification failed']);
    }

    $db->prepare('UPDATE passkeys SET record = ?, last_used_at = CURRENT_TIMESTAMP WHERE passkey_id = ?')
        ->execute([webauthn_serializer()->serialize($record, 'json'), $passkey['passkey_id']]);

    start_session($db, $passkey['passkey_id']);
    respond_empty();
}

function log_out(): never
{
    require_website_origin();
    end_session(get_db());
    respond_empty();
}

function setup_status(): never
{
    $stmt = get_db()->query('SELECT EXISTS (SELECT 1 FROM setup_codes WHERE expires_at > CURRENT_TIMESTAMP)');

    respond(200, ['available' => (bool) $stmt->fetchColumn()]);
}

return [
    '/auth/setup' => ['GET' => 'setup_status'],
    '/auth/options' => ['POST' => 'create_login_options'],
    '/auth/login' => ['POST' => 'log_in'],
    '/auth/logout' => ['POST' => 'log_out'],
];