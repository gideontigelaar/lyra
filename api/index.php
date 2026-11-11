<?php

declare(strict_types=1);

require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/pipeline.php';

set_exception_handler(function (Throwable $e): void {
    error_log((string) $e);
    respond(500, ['error' => 'internal server error']);
});

const MODULES = ['health', 'device'];

$routes = [];

foreach (MODULES as $module) {
    foreach (require __DIR__ . "/modules/$module.php" as $route => $methods) {
        $routes[$route] = ($routes[$route] ?? []) + $methods;
    }
}

$base = dirname($_SERVER['SCRIPT_NAME']);
$uri = explode('?', $_SERVER['REQUEST_URI'], 2)[0];
$path = '/' . trim(substr($uri, strlen($base)), '/');

$methods = $routes[$path] ?? respond(404, ['error' => 'not found']);
$handler = $methods[$_SERVER['REQUEST_METHOD']] ?? null;

if ($handler === null) {
    header('Allow: ' . implode(', ', array_keys($methods)));
    respond(405, ['error' => 'method not allowed']);
}

$handler();