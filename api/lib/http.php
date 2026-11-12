<?php

declare(strict_types=1);

const MAX_BODY_BYTES = 65536;
const WEBSITE_ORIGIN = 'https://lyra.gideontigelaar.com';
const NAME_LENGTH = 50;

function send_security_headers(): void
{
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    header('Cross-Origin-Resource-Policy: same-site');
    header('Referrer-Policy: no-referrer');
    header('Strict-Transport-Security: max-age=31536000');
    header('X-Content-Type-Options: nosniff');
}

function allow_website(): void
{
    header('Access-Control-Allow-Origin: ' . WEBSITE_ORIGIN);
    header('Access-Control-Allow-Credentials: true');
}

function require_website_origin(): void
{
    if (($_SERVER['HTTP_ORIGIN'] ?? '') !== WEBSITE_ORIGIN) {
        respond(403, ['error' => 'forbidden']);
    }
}

function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
    exit;
}

function respond_empty(): never
{
    http_response_code(204);
    header('Cache-Control: no-store');
    exit;
}

function iso_time(?string $timestamp): ?string
{
    return $timestamp === null ? null : str_replace(' ', 'T', $timestamp) . 'Z';
}

function read_json(int $limit = MAX_BODY_BYTES): array
{
    $input = file_get_contents('php://input', length: $limit);

    try {
        $data = json_decode($input, true, 8, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        respond(400, ['error' => 'invalid json']);
    }

    if (!is_array($data) || !str_starts_with(ltrim($input), '{')) {
        respond(400, ['error' => 'expected a json object']);
    }

    return $data;
}

function read_name(mixed $value): string
{
    $name = is_string($value) ? trim($value) : '';

    if ($name === '' || mb_strlen($name) > NAME_LENGTH) {
        respond(400, ['error' => 'name must be between 1 and ' . NAME_LENGTH . ' characters']);
    }

    return $name;
}