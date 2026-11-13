<?php

declare(strict_types=1);

const DECODERS = ['bthome'];
const SINKS = ['lyra'];
// How often a source relays each of its sensors. Some sensors spread their values over broadcasts of their own, like pvvx
// sends temperature and humidity in one and the battery in another, so a source relays often enough to catch each in time.
const RELAY_SECONDS = 60;
// A sensor with every value turned off is still relayed now and then, so a value that's new to it shows up.
const IDLE_RELAY_SECONDS = 900;
// A source's restarts, reconnects and dropped broadcasts are counted over this many days.
const COUNT_DAYS = 7;
const MAC_PATTERN = '/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/';

function plugin(string $kind, string $name): array
{
    static $loaded = [];

    return $loaded["$kind/$name"] ??= require dirname(__DIR__) . "/plugins/$kind/$name.php";
}

function plugin_list(string $kind, array $names): array
{
    return array_map(fn(string $name) => ['name' => $name, 'label' => plugin($kind, $name)['label']], $names);
}

function parse_advert(string $payload): array
{
    $advert = ['service_data' => [], 'manufacturer_data' => []];
    $offset = 0;

    while ($offset + 1 < strlen($payload)) {
        $length = ord($payload[$offset]);

        if ($length === 0 || $offset + 1 + $length > strlen($payload)) {
            break;
        }

        $type = ord($payload[$offset + 1]);
        $data = substr($payload, $offset + 2, $length - 1);

        if (strlen($data) >= 2 && ($type === 0x16 || $type === 0xFF)) {
            $advert[$type === 0x16 ? 'service_data' : 'manufacturer_data'][unpack('v', $data)[1]] = substr($data, 2);
        }

        $offset += 1 + $length;
    }

    return $advert;
}

// The metrics there are, by name, with how a sensor records each of them if it does.
function sensor_metric_rows(PDO $db, int $sensor_id): array
{
    $stmt = $db->prepare(
        'SELECT m.name, m.metric_id, m.default_interval, sm.report_interval, sm.is_active
         FROM metrics m
         LEFT JOIN sensor_metrics sm ON sm.metric_id = m.metric_id AND sm.sensor_id = ?'
    );
    $stmt->execute([$sensor_id]);

    return array_column($stmt->fetchAll(), null, 'name');
}

// Adds the values a decoder declares to the metrics, so a new kind of value needs no database change, and says whether
// there were any. Only call it for values that are missing: metric_id is small, and an insert that's ignored can still use up an id.
function add_metrics(PDO $db, string $decoder, array $names): bool
{
    $declared = in_array($decoder, DECODERS, true) ? plugin('decoders', $decoder)['metrics'] ?? [] : [];
    $new = array_intersect_key($declared, array_flip($names));
    $insert = $db->prepare('INSERT IGNORE INTO metrics (name, unit, default_interval) VALUES (?, ?, ?)');

    foreach ($new as $name => [$unit, $interval]) {
        $insert->execute([$name, $unit, $interval]);
    }

    return $new !== [];
}

function ingest_advert(PDO $db, array $sensor, string $payload, int $time): int
{
    if (!in_array($sensor['decoder'], DECODERS, true)) {
        return 0;
    }

    $values = plugin('decoders', $sensor['decoder'])['decode'](parse_advert($payload));

    if ($values === []) {
        return 0;
    }

    $rows = sensor_metric_rows($db, $sensor['sensor_id']);

    if (add_metrics($db, $sensor['decoder'], array_keys(array_diff_key($values, $rows)))) {
        $rows = sensor_metric_rows($db, $sensor['sensor_id']);
    }

    $discover = $db->prepare('INSERT IGNORE INTO sensor_metrics (sensor_id, metric_id, report_interval) VALUES (?, ?, ?)');
    $metrics = [];

    foreach (array_intersect_key($rows, $values) as $name => $row) {
        if ($row['report_interval'] === null) {
            $discover->execute([$sensor['sensor_id'], $row['metric_id'], $row['default_interval']]);
        }

        if ($row['is_active'] ?? true) {
            $metrics[] = ['id' => $row['metric_id'], 'interval' => $row['report_interval'] ?? $row['default_interval'], 'value' => $values[$name]];
        }
    }

    $stmt = $db->prepare('SELECT sink FROM sensor_sinks WHERE sensor_id = ?');
    $stmt->execute([$sensor['sensor_id']]);
    $stored = 0;

    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $sink) {
        if (in_array($sink, SINKS, true) && $metrics !== []) {
            $stored += plugin('sinks', $sink)['write']($db, $sensor['sensor_id'], $metrics, $time);
        }
    }

    return $stored;
}