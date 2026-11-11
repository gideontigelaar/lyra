<?php

declare(strict_types=1);

function get_db(): PDO
{
    static $db = null;

    if ($db === null) {
        $creds = json_decode(file_get_contents(dirname(__DIR__) . '/creds.json'), true, 2, JSON_THROW_ON_ERROR);

        $db = new PDO(
            "mysql:host=localhost;dbname={$creds['database']};charset=utf8mb4",
            $creds['username'],
            $creds['password'],
            [PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
        );

        $db->exec("SET time_zone = '+00:00'");
    }

    return $db;
}