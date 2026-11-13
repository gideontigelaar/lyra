<?php

declare(strict_types=1);

const BTHOME_UUID = 0xFCD2;

const BTHOME_METRICS = [
    0x01 => ['battery', false, 1],
    0x02 => ['temperature', true, 0.01],
    0x03 => ['humidity', false, 0.01],
    0x04 => ['pressure', false, 0.01],
    0x05 => ['illuminance', false, 0.01],
    0x08 => ['dew_point', true, 0.01],
    0x0C => ['voltage', false, 0.001],
    0x12 => ['co2', false, 1],
    0x2E => ['humidity', false, 1],
    0x45 => ['temperature', true, 0.1],
];

function bthome_length(int $id): ?int
{
    return match (true) {
        in_array($id, [0x00, 0x01, 0x09, 0x0F, 0x10, 0x11, 0x3A, 0x46], true), $id >= 0x15 && $id <= 0x2F => 1,
        in_array($id, [0x02, 0x03, 0x06, 0x07, 0x08, 0x0C, 0x0D, 0x0E, 0x12, 0x13, 0x14, 0x3C, 0x3D, 0x3F, 0x40, 0x41, 0x43, 0x44, 0x45, 0x47, 0x48, 0x49, 0x4A, 0x51, 0x52], true) => 2,
        in_array($id, [0x04, 0x05, 0x0A, 0x0B, 0x42, 0x4B], true) => 3,
        in_array($id, [0x3E, 0x4C, 0x4D, 0x4E, 0x4F, 0x50], true) => 4,
        default => null,
    };
}

return [
    'label' => 'BTHome',
    // Each value it reads, with its unit and how often it's recorded until a sensor's settings say otherwise.
    'metrics' => [
        'temperature' => ['°C', 900],
        'humidity' => ['%', 900],
        'battery' => ['%', 3600],
        'voltage' => ['V', 3600],
        'pressure' => ['hPa', 900],
        'illuminance' => ['lx', 900],
        'dew_point' => ['°C', 900],
        'co2' => ['ppm', 900],
    ],
    'decode' => static function (array $advert): array {
        $data = $advert['service_data'][BTHOME_UUID] ?? '';

        if ($data === '' || ord($data[0]) & 0x01 || ord($data[0]) >> 5 !== 2) {
            return [];
        }

        $values = [];
        $offset = ord($data[0]) & 0x02 ? 7 : 1;

        while ($offset < strlen($data)) {
            $id = ord($data[$offset++]);
            $length = bthome_length($id);

            if ($length === null || $offset + $length > strlen($data)) {
                break;
            }

            if (isset(BTHOME_METRICS[$id])) {
                [$name, $signed, $factor] = BTHOME_METRICS[$id];
                $raw = 0;

                for ($i = $length - 1; $i >= 0; $i--) {
                    $raw = $raw << 8 | ord($data[$offset + $i]);
                }

                if ($signed && $raw >= 1 << ($length * 8 - 1)) {
                    $raw -= 1 << ($length * 8);
                }

                $values[$name] = round($raw * $factor, 3);
            }

            $offset += $length;
        }

        return $values;
    },
];