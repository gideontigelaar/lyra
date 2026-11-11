<?php

declare(strict_types=1);

use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\Exception\WebauthnException;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialDescriptor;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;

function registering_user(PDO $db, array $data): array
{
    $session = current_session($db);

    if ($session !== null) {
        return [$session['user_id'], null];
    }

    $code = $data['setup_code'] ?? null;

    if (is_string($code)) {
        $stmt = $db->prepare('SELECT user_id FROM setup_codes WHERE code_hash = ? AND expires_at > CURRENT_TIMESTAMP');
        $stmt->execute([hash('sha256', $code)]);
        $user_id = $stmt->fetchColumn();

        if ($user_id !== false) {
            return [$user_id, hash('sha256', $code)];
        }
    }

    respond(401, ['error' => 'unauthorized']);
}

function registration_options(PDO $db, int $user_id, string $challenge): PublicKeyCredentialCreationOptions
{
    $stmt = $db->prepare('SELECT handle, name FROM users WHERE user_id = ?');
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();

    $stmt = $db->prepare('SELECT credential_id FROM passkeys WHERE user_id = ?');
    $stmt->execute([$user_id]);

    return PublicKeyCredentialCreationOptions::create(
        PublicKeyCredentialRpEntity::create('Lyra', webauthn_rp_id()),
        PublicKeyCredentialUserEntity::create($user['name'], $user['handle'], $user['name']),
        $challenge,
        array_map(fn (string $algorithm) => PublicKeyCredentialParameters::createPk($algorithm::identifier()), PASSKEY_ALGORITHMS),
        AuthenticatorSelectionCriteria::create(
            userVerification: AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED,
            residentKey: AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_REQUIRED,
        ),
        PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE,
        array_map(
            fn (string $id) => PublicKeyCredentialDescriptor::create(PublicKeyCredentialDescriptor::CREDENTIAL_TYPE_PUBLIC_KEY, $id),
            $stmt->fetchAll(PDO::FETCH_COLUMN),
        ),
        CHALLENGE_SECONDS * 1000,
    );
}

function create_registration_options(): never
{
    require_website_origin();
    $db = get_db();
    [$user_id] = registering_user($db, read_json());

    respond(200, webauthn_options(registration_options($db, $user_id, create_challenge($db, $user_id))));
}

function create_passkey(): never
{
    require_website_origin();
    $db = get_db();
    $data = read_json();
    [$user_id, $code_hash] = registering_user($db, $data);
    $name = read_name($data['name'] ?? null);

    $credential = read_credential($data['credential'] ?? null);
    $response = $credential->response;

    if (!$response instanceof AuthenticatorAttestationResponse) {
        respond(400, ['error' => 'invalid credential']);
    }

    $challenge = $response->clientDataJSON->challenge;
    consume_challenge($db, $challenge, $user_id);

    try {
        $record = AuthenticatorAttestationResponseValidator::create(webauthn_ceremonies()->creationCeremony())->check(
            $response,
            registration_options($db, $user_id, $challenge),
            webauthn_rp_id(),
        );
    } catch (WebauthnException) {
        respond(400, ['error' => 'passkey verification failed']);
    }

    $db->beginTransaction();

    if ($code_hash !== null) {
        $stmt = $db->prepare('DELETE FROM setup_codes WHERE code_hash = ? AND expires_at > CURRENT_TIMESTAMP');
        $stmt->execute([$code_hash]);

        if ($stmt->rowCount() !== 1) {
            $db->rollBack();
            respond(401, ['error' => 'unauthorized']);
        }
    }

    $stmt = $db->prepare('SELECT 1 FROM passkeys WHERE credential_id = ?');
    $stmt->execute([$record->publicKeyCredentialId]);

    if ($stmt->fetchColumn() !== false) {
        $db->rollBack();
        respond(409, ['error' => 'passkey already registered']);
    }

    $db->prepare('INSERT INTO passkeys (user_id, credential_id, name, record) VALUES (?, ?, ?, ?)')
        ->execute([$user_id, $record->publicKeyCredentialId, $name, webauthn_serializer()->serialize($record, 'json')]);
    $passkey_id = (int) $db->lastInsertId();

    $db->commit();

    if ($code_hash !== null) {
        start_session($db, $passkey_id);
    }

    respond(201, ['id' => $passkey_id]);
}

function list_passkeys(): never
{
    $db = get_db();
    $session = require_session($db);

    $stmt = $db->prepare('SELECT passkey_id, name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY passkey_id');
    $stmt->execute([$session['user_id']]);
    $passkeys = [];

    foreach ($stmt as $row) {
        $passkeys[] = [
            'id' => $row['passkey_id'],
            'name' => $row['name'],
            'created_at' => iso_time($row['created_at']),
            'last_used_at' => iso_time($row['last_used_at']),
            'current' => $row['passkey_id'] === $session['passkey_id'],
        ];
    }

    respond(200, ['passkeys' => $passkeys]);
}

function delete_passkey(string $id): never
{
    require_website_origin();
    $db = get_db();
    $session = require_session($db);
    $passkey_id = filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

    $stmt = $db->prepare('SELECT COUNT(*), SUM(passkey_id = ?) FROM passkeys WHERE user_id = ?');
    $stmt->execute([$passkey_id === false ? 0 : $passkey_id, $session['user_id']]);
    [$count, $found] = $stmt->fetch(PDO::FETCH_NUM);

    if (!$found) {
        respond(404, ['error' => 'not found']);
    }

    if ($count === 1) {
        respond(409, ['error' => 'cannot delete the last passkey']);
    }

    $db->beginTransaction();
    $db->prepare('DELETE FROM sessions WHERE passkey_id = ?')->execute([$passkey_id]);
    $db->prepare('DELETE FROM passkeys WHERE passkey_id = ?')->execute([$passkey_id]);
    $db->commit();

    if ($passkey_id === $session['passkey_id']) {
        end_session($db);
    }

    respond_empty();
}

return [
    '/passkeys' => ['GET' => 'list_passkeys', 'POST' => 'create_passkey'],
    '/passkeys/options' => ['POST' => 'create_registration_options'],
    '/passkeys/{id}' => ['DELETE' => 'delete_passkey'],
];