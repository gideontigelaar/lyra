<?php

declare(strict_types=1);

function health_check(): never
{
    respond(200, [
        'service' => 'lyra-api',
        'status' => 'online',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
    ]);
}

return [
    '/' => ['GET' => 'health_check'],
];