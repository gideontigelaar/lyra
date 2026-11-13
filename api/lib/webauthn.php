<?php

declare(strict_types=1);

use Cose\Algorithm\Manager;
use Cose\Algorithm\Signature\ECDSA\ES256;
use Cose\Algorithm\Signature\EdDSA\EdDSA;
use Cose\Algorithm\Signature\RSA\RS256;
use Symfony\Component\Serializer\Exception\ExceptionInterface as SerializerException;
use Symfony\Component\Serializer\Normalizer\AbstractObjectNormalizer;
use Symfony\Component\Serializer\SerializerInterface;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\Exception\WebauthnException;
use Webauthn\PublicKeyCredential;

const PASSKEY_ALGORITHMS = [EdDSA::class, ES256::class, RS256::class];
const CHALLENGE_SECONDS = 300;
const MAX_CHALLENGES = 50;

function webauthn_rp_id(): string
{
    return parse_url(WEBSITE_ORIGIN, PHP_URL_HOST);
}

function webauthn_serializer(): SerializerInterface
{
    static $serializer = null;

    return $serializer ??= (new WebauthnSerializerFactory(
        AttestationStatementSupportManager::create([NoneAttestationStatementSupport::create()])
    ))->create();
}

function webauthn_ceremonies(): CeremonyStepManagerFactory
{
    $factory = new CeremonyStepManagerFactory();
    $factory->setAllowedOrigins([WEBSITE_ORIGIN]);
    $factory->setAlgorithmManager(Manager::create()->add(...array_map(fn (string $algorithm) => new $algorithm(), PASSKEY_ALGORITHMS)));

    return $factory;
}

function webauthn_options(object $options): array
{
    return webauthn_serializer()->normalize($options, 'json', [AbstractObjectNormalizer::SKIP_NULL_VALUES => true]);
}

function read_credential(mixed $data): PublicKeyCredential
{
    try {
        $credential = is_array($data) ? webauthn_serializer()->denormalize($data, PublicKeyCredential::class, 'json') : null;
    } catch (SerializerException | WebauthnException | InvalidArgumentException) {
        $credential = null;
    }

    return $credential ?? respond(400, ['error' => 'invalid credential']);
}

function create_challenge(PDO $db, ?int $user_id): string
{
    $challenge = random_bytes(32);

    $db->exec('DELETE FROM challenges WHERE expires_at <= CURRENT_TIMESTAMP');

    // Anyone can ask for a challenge to sign in with, so only so many can wait at once.
    if ($db->query('SELECT COUNT(*) FROM challenges')->fetchColumn() >= MAX_CHALLENGES) {
        header('Retry-After: ' . CHALLENGE_SECONDS);
        respond(429, ['error' => 'too many sign-in attempts, try again in a few minutes']);
    }

    $db->prepare('INSERT INTO challenges (challenge_hash, user_id, expires_at) VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL ? SECOND)')
        ->execute([hash('sha256', $challenge), $user_id, CHALLENGE_SECONDS]);

    return $challenge;
}

function consume_challenge(PDO $db, string $challenge, ?int $user_id): void
{
    $stmt = $db->prepare('DELETE FROM challenges WHERE challenge_hash = ? AND user_id <=> ? AND expires_at > CURRENT_TIMESTAMP');
    $stmt->execute([hash('sha256', $challenge), $user_id]);

    if ($stmt->rowCount() !== 1) {
        respond(400, ['error' => 'invalid or expired challenge']);
    }
}