<?php

declare(strict_types=1);

const MAX_BODY_BYTES = 65536;

function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
    exit;
}

function read_json(): array
{
    try {
        $data = json_decode(file_get_contents('php://input', length: MAX_BODY_BYTES), true, 8, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        respond(400, ['error' => 'invalid json']);
    }

    if (!is_array($data) || array_is_list($data)) {
        respond(400, ['error' => 'expected a json object']);
    }

    return $data;
}