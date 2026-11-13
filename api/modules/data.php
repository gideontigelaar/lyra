<?php

declare(strict_types=1);

const BUCKET_SECONDS = 900;
const BUCKET_MAX_DAYS = ['raw' => 31, 'hour' => 31, 'day' => 400, 'week' => 1100, 'month' => 3700];
// The longest a bucket can be, with an hour for a change to or from summer time.
const BUCKET_LONGEST = ['raw' => 0, 'hour' => 3600, 'day' => 90000, 'week' => 608400, 'month' => 2682000];
const MAX_RANGES = 1000;
const IMPORT_ROWS = 5000;
const IMPORT_BODY_BYTES = 1048576;
// Readings of one value this close together are the same reading, from a backup that overlaps what's stored.
const SAME_READING_SECONDS = 60;

function read_utc_time(mixed $value): ?int
{
    if (!is_string($value) || !preg_match('/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,6})?Z$/', $value, $match)) {
        return null;
    }

    $time = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s', $match[1], new DateTimeZone('UTC'));

    return $time !== false && $time->format('Y-m-d\TH:i:s') === $match[1] ? $time->getTimestamp() : null;
}

function read_sensor_metric(PDO $db, mixed $sensor, mixed $metric): array
{
    $stmt = $db->prepare(
        'SELECT sm.sensor_id, sm.metric_id, m.unit
         FROM sensor_metrics sm
         JOIN metrics m USING (metric_id)
         WHERE sm.sensor_id = ? AND m.name = ?'
    );
    $stmt->execute([is_int($sensor) || (is_string($sensor) && ctype_digit($sensor)) ? $sensor : 0, is_string($metric) ? $metric : '']);

    return $stmt->fetch() ?: respond(400, ['error' => 'unknown sensor or metric']);
}

function bucket_key(string $bucket, int $time, int $local): string|int
{
    return match ($bucket) {
        'hour' => $time - $local % 3600,
        'day' => gmdate('Y-m-d', $local),
        'week' => gmdate('Y-m-d', $local - ((int) gmdate('N', $local) - 1) * 86400),
        'month' => gmdate('Y-m-01', $local),
    };
}

function list_readings(): never
{
    $db = get_db();
    require_session($db);

    $row = read_sensor_metric($db, $_GET['sensor'] ?? null, $_GET['metric'] ?? null);
    $bucket = $_GET['bucket'] ?? 'raw';
    $start = read_utc_time($_GET['from'] ?? null);
    $end = read_utc_time($_GET['to'] ?? null);

    if (!is_string($bucket) || !isset(BUCKET_MAX_DAYS[$bucket])) {
        respond(400, ['error' => 'bucket must be one of: ' . implode(', ', array_keys(BUCKET_MAX_DAYS))]);
    }

    if ($start === null || $end === null || $start >= $end) {
        respond(400, ['error' => 'from and to must be ISO 8601 times in UTC, from before to']);
    }

    if ($end - $start > BUCKET_MAX_DAYS[$bucket] * 86400) {
        respond(400, ['error' => "a $bucket range is at most " . BUCKET_MAX_DAYS[$bucket] . ' days']);
    }

    try {
        $zone = new DateTimeZone(is_string($_GET['tz'] ?? null) ? $_GET['tz'] : 'UTC');
    } catch (DateInvalidTimeZoneException) {
        respond(400, ['error' => 'unknown time zone']);
    }

    // Buckets follow the zone's changes to and from summer time. An offset like +02:00 has none to follow.
    if ($zone->getTransitions($start, $end) === false) {
        respond(400, ['error' => 'tz must be a named time zone, like Europe/Amsterdam']);
    }

    respond(200, [
        'unit' => $row['unit'],
        'bucket' => $bucket,
        'readings' => read_buckets($db, $row, $bucket, $zone, $start, $end),
        'before' => edge_bucket($db, $row, $bucket, $zone, $start, true),
        'after' => edge_bucket($db, $row, $bucket, $zone, $end, false),
    ]);
}

function read_buckets(PDO $db, array $row, string $bucket, DateTimeZone $zone, int $start, int $end): array
{
    $readings = [];

    if ($bucket === 'raw') {
        $stmt = $db->prepare(
            'SELECT measured_at, value FROM readings
             WHERE sensor_id = ? AND metric_id = ? AND measured_at >= FROM_UNIXTIME(?) AND measured_at < FROM_UNIXTIME(?)
             ORDER BY measured_at'
        );
        $stmt->execute([$row['sensor_id'], $row['metric_id'], $start, $end]);

        foreach ($stmt as $reading) {
            $readings[] = ['time' => iso_time($reading['measured_at']), 'value' => $reading['value']];
        }

        return $readings;
    }

    $stmt = $db->prepare(
        'SELECT FLOOR(UNIX_TIMESTAMP(measured_at) / ?) * ? AS time, SUM(value) AS total, COUNT(*) AS count, MIN(value) AS min, MAX(value) AS max
         FROM readings
         WHERE sensor_id = ? AND metric_id = ? AND measured_at >= FROM_UNIXTIME(?) AND measured_at < FROM_UNIXTIME(?)
         GROUP BY time
         ORDER BY time'
    );
    $stmt->execute([BUCKET_SECONDS, BUCKET_SECONDS, $row['sensor_id'], $row['metric_id'], $start, $end]);

    $transitions = $zone->getTransitions($start, $end);
    $buckets = [];

    foreach ($stmt as $part) {
        $time = (int) $part['time'];

        while (isset($transitions[1]) && $transitions[1]['ts'] <= $time) {
            array_shift($transitions);
        }

        $key = bucket_key($bucket, $time, $time + $transitions[0]['offset']);
        $buckets[$key] ??= ['total' => 0.0, 'count' => 0, 'min' => $part['min'], 'max' => $part['max']];
        $buckets[$key]['total'] += $part['total'];
        $buckets[$key]['count'] += $part['count'];
        $buckets[$key]['min'] = min($buckets[$key]['min'], $part['min']);
        $buckets[$key]['max'] = max($buckets[$key]['max'], $part['max']);
    }

    foreach ($buckets as $key => $item) {
        $readings[] = [
            'time' => gmdate('Y-m-d\TH:i:s\Z', is_int($key) ? $key : (new DateTimeImmutable($key, $zone))->getTimestamp()),
            'avg' => round($item['total'] / $item['count'], 3),
            'min' => $item['min'],
            'max' => $item['max'],
        ];
    }

    return $readings;
}

// The bucket of the nearest reading before or after a time, however far away. A chart's line carries on to it, across any gap.
function edge_bucket(PDO $db, array $row, string $bucket, DateTimeZone $zone, int $time, bool $before): ?array
{
    $stmt = $db->prepare(
        'SELECT UNIX_TIMESTAMP(' . ($before ? 'MAX' : 'MIN') . '(measured_at)) FROM readings
         WHERE sensor_id = ? AND metric_id = ? AND measured_at ' . ($before ? '<' : '>=') . ' FROM_UNIXTIME(?)'
    );
    $stmt->execute([$row['sensor_id'], $row['metric_id'], $time]);
    $nearest = $stmt->fetchColumn();

    if ($nearest === null) {
        return null;
    }

    // Nothing lies between that reading and the time, so its bucket is the last or first one in this stretch.
    $buckets = $before
        ? read_buckets($db, $row, $bucket, $zone, (int) $nearest - BUCKET_LONGEST[$bucket], $time)
        : read_buckets($db, $row, $bucket, $zone, $time, (int) $nearest + BUCKET_LONGEST[$bucket] + 1);

    return $before ? end($buckets) : $buckets[0];
}

function delete_readings(): never
{
    require_website_origin();
    $db = get_db();
    require_session($db);
    $data = read_json();
    $row = read_sensor_metric($db, $data['sensor'] ?? null, $data['metric'] ?? null);
    $ranges = $data['ranges'] ?? null;

    if (!is_array($ranges) || !array_is_list($ranges) || $ranges === [] || count($ranges) > MAX_RANGES) {
        respond(400, ['error' => 'ranges must be a list of 1 to ' . MAX_RANGES . ' ranges']);
    }

    $delete = $db->prepare(
        'DELETE FROM readings WHERE sensor_id = ? AND metric_id = ? AND measured_at >= FROM_UNIXTIME(?) AND measured_at < FROM_UNIXTIME(?)'
    );
    $deleted = 0;
    $db->beginTransaction();

    foreach ($ranges as $range) {
        $start = read_utc_time($range['from'] ?? null);
        $end = read_utc_time($range['to'] ?? null);

        if ($start === null || $end === null || $start >= $end) {
            respond(400, ['error' => 'each range needs from and to as ISO 8601 times in UTC, from before to']);
        }

        $delete->execute([$row['sensor_id'], $row['metric_id'], $start, $end]);
        $deleted += $delete->rowCount();
    }

    $db->commit();
    respond(200, ['deleted' => $deleted]);
}

function read_sensor(PDO $db, mixed $sensor): array
{
    $stmt = $db->prepare('SELECT sensor_id, decoder FROM sensors WHERE sensor_id = ?');
    $stmt->execute([is_int($sensor) || (is_string($sensor) && ctype_digit($sensor)) ? $sensor : 0]);

    return $stmt->fetch() ?: respond(404, ['error' => 'sensor not found']);
}

// Every reading of a sensor as CSV, oldest first per value, in the units they're stored in.
function export_readings(): never
{
    $db = get_db();
    require_session($db);
    $sensor = read_sensor($db, $_GET['sensor'] ?? null)['sensor_id'];

    // Rows go out as they're read, so a long history doesn't have to fit in memory.
    $db->setAttribute(Pdo\Mysql::ATTR_USE_BUFFERED_QUERY, false);
    $stmt = $db->prepare(
        'SELECT r.measured_at, m.name, r.value, m.unit
         FROM readings r
         JOIN metrics m USING (metric_id)
         WHERE r.sensor_id = ?
         ORDER BY r.metric_id, r.measured_at'
    );
    $stmt->execute([$sensor]);

    header('Content-Type: text/csv; charset=utf-8');
    header("Content-Disposition: attachment; filename=\"sensor-$sensor.csv\"");
    header('Cache-Control: no-store');
    // The byte order mark tells Excel the file is UTF-8, so units like °C show right.
    echo "\u{FEFF}time,metric,value,unit\n";

    foreach ($stmt as $row) {
        echo iso_time($row['measured_at']), ',', $row['name'], ',', $row['value'], ',', $row['unit'], "\n";
    }

    exit;
}

// Adds readings from a backup. Readings already stored, or within a minute of a stored one of the same value, are skipped.
function import_readings(): never
{
    require_website_origin();
    $db = get_db();
    require_session($db);
    $data = read_json(IMPORT_BODY_BYTES);
    ['sensor_id' => $sensor, 'decoder' => $decoder] = read_sensor($db, $data['sensor'] ?? null);
    $rows = $data['readings'] ?? null;

    if (!is_array($rows) || !array_is_list($rows) || $rows === [] || count($rows) > IMPORT_ROWS) {
        respond(400, ['error' => 'readings must be a list of 1 to ' . IMPORT_ROWS . ' readings']);
    }

    $known = fn() => array_column($db->query('SELECT name, metric_id, unit, default_interval FROM metrics')->fetchAll(), null, 'name');
    $metrics = $known();
    // A value the sensor's decoder declares counts too, also when no sensor sent one yet.
    $names = array_unique(array_filter(array_map(fn(mixed $row) => is_array($row) && is_string($row[0] ?? null) ? $row[0] : null, $rows)));

    if (add_metrics($db, $decoder, array_diff($names, array_keys($metrics)))) {
        $metrics = $known();
    }

    // Each reading is [metric, time, value] or [metric, time, value, unit]. Unknown values, other units and times in the future don't count.
    $valid = [];
    $invalid = 0;
    $latest = time() + 300;

    foreach ($rows as $row) {
        [$name, $time, $value, $unit] = is_array($row) && array_is_list($row) ? $row + [null, null, null, null] : [null, null, null, null];
        $metric = is_string($name) ? $metrics[$name] ?? null : null;
        $time = read_utc_time($time);

        if ($metric === null || $time === null || $time > $latest || !(is_int($value) || is_float($value)) || ($unit !== null && $unit !== $metric['unit'])) {
            $invalid++;
            continue;
        }

        $valid[$metric['metric_id']][$time] = (float) $value;
    }

    $discover = $db->prepare('INSERT IGNORE INTO sensor_metrics (sensor_id, metric_id, report_interval) VALUES (?, ?, ?)');
    $stored = $db->prepare(
        'SELECT UNIX_TIMESTAMP(measured_at) FROM readings
         WHERE sensor_id = ? AND metric_id = ? AND measured_at BETWEEN FROM_UNIXTIME(?) AND FROM_UNIXTIME(?)
         ORDER BY measured_at'
    );
    $intervals = array_column($metrics, 'default_interval', 'metric_id');
    $added = 0;
    $skipped = 0;
    $db->beginTransaction();

    foreach ($valid as $metric_id => $readings) {
        ksort($readings);
        $times = array_keys($readings);
        $discover->execute([$sensor, $metric_id, $intervals[$metric_id]]);
        $stored->execute([$sensor, $metric_id, $times[0] - SAME_READING_SECONDS, end($times) + SAME_READING_SECONDS]);
        $existing = array_map('intval', $stored->fetchAll(PDO::FETCH_COLUMN));
        $next = 0;
        $last = null;
        $new = [];

        // Both lists are in time order, so one pass finds each reading's nearest stored neighbours.
        foreach ($readings as $time => $value) {
            while (isset($existing[$next]) && $existing[$next] < $time - SAME_READING_SECONDS) {
                $next++;
            }

            $taken = isset($existing[$next]) && $existing[$next] <= $time + SAME_READING_SECONDS;

            if ($taken || ($last !== null && $time - $last <= SAME_READING_SECONDS)) {
                $skipped++;
                continue;
            }

            $new[] = [$sensor, $metric_id, $value, $time];
            $last = $time;
        }

        foreach (array_chunk($new, 500) as $chunk) {
            $db->prepare('INSERT INTO readings (sensor_id, metric_id, value, measured_at) VALUES ' . implode(', ', array_fill(0, count($chunk), '(?, ?, ?, FROM_UNIXTIME(?))')))
                ->execute(array_merge(...$chunk));
            $added += count($chunk);
        }
    }

    $db->commit();
    respond(200, ['added' => $added, 'skipped' => $skipped, 'invalid' => $invalid]);
}

return [
    '/readings' => ['GET' => 'list_readings', 'DELETE' => 'delete_readings'],
    '/readings/export' => ['GET' => 'export_readings'],
    '/readings/import' => ['POST' => 'import_readings'],
];