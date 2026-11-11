<?php

declare(strict_types=1);

const INTERVAL_TOLERANCE = 0.9;

return [
    'label' => 'Lyra',
    'write' => static function (PDO $db, int $sensor_id, array $metrics, int $time): int {
        $last = $db->prepare('SELECT UNIX_TIMESTAMP(MAX(measured_at)) FROM readings WHERE sensor_id = ? AND metric_id = ?');
        $insert = $db->prepare('INSERT IGNORE INTO readings (sensor_id, metric_id, value, measured_at) VALUES (?, ?, ?, FROM_UNIXTIME(?))');
        $stored = 0;

        foreach ($metrics as $metric) {
            $last->execute([$sensor_id, $metric['id']]);
            $previous = $last->fetchColumn();

            if ($previous === null || $time - (int) $previous >= $metric['interval'] * INTERVAL_TOLERANCE) {
                $insert->execute([$sensor_id, $metric['id'], $metric['value'], $time]);
                $stored += $insert->rowCount();
            }
        }

        return $stored;
    },
];