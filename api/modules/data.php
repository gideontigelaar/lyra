<?php

declare(strict_types=1);

const BUCKET_SECONDS = 900;
const BUCKET_MAX_DAYS = ['raw' => 31, 'hour' => 31, 'day' => 400, 'week' => 1100, 'month' => 3700];
const MAX_RANGES = 1000;

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

        respond(200, ['unit' => $row['unit'], 'bucket' => $bucket, 'readings' => $readings]);
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

    respond(200, ['unit' => $row['unit'], 'bucket' => $bucket, 'readings' => $readings]);
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

return [
    '/readings' => ['GET' => 'list_readings', 'DELETE' => 'delete_readings'],
];