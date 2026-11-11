<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/webauthn.php';
require __DIR__ . '/lib/pipeline.php';

set_exception_handler(function (Throwable $e): void {
    error_log((string) $e);
    respond(500, ['error' => 'internal server error']);
});

send_security_headers();
allow_website();

const MODULES = ['health', 'device', 'auth', 'passkeys', 'sensors', 'devices', 'data', 'dashboard'];

$routes = [];

foreach (MODULES as $module) {
    foreach (require __DIR__ . "/modules/$module.php" as $route => $methods) {
        $routes[$route] = ($routes[$route] ?? []) + $methods;
    }
}

$base = dirname($_SERVER['SCRIPT_NAME']);
$uri = explode('?', $_SERVER['REQUEST_URI'], 2)[0];
$path = '/' . trim(substr($uri, strlen($base)), '/');

foreach ($routes as $route => $methods) {
    if (preg_match('#^' . preg_replace('#\\\\\{\w+\\\\\}#', '([^/]+)', preg_quote($route, '#')) . '$#', $path, $match)) {
        break;
    }
}

if ($match === []) {
    respond(404, ['error' => 'not found']);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: ' . implode(', ', array_keys($methods)));
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 7200');
    respond_empty();
}

$handler = $methods[$_SERVER['REQUEST_METHOD']] ?? null;

if ($handler === null) {
    header('Allow: ' . implode(', ', array_keys($methods)));
    respond(405, ['error' => 'method not allowed']);
}

$handler(...array_slice($match, 1));