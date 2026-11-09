#include "sensors/bthome.h"

static int objectLength(uint8_t id) {
    switch (id) {
        case 0x00: case 0x01: case 0x09: case 0x0F: case 0x10: case 0x11:
        case 0x3A: case 0x46:
            return 1;
        case 0x02: case 0x03: case 0x06: case 0x07: case 0x08: case 0x0C:
        case 0x0D: case 0x0E: case 0x12: case 0x13: case 0x14: case 0x3C:
        case 0x3D: case 0x3F: case 0x40: case 0x41: case 0x43: case 0x44:
        case 0x45: case 0x47: case 0x48: case 0x49: case 0x4A: case 0x51:
        case 0x52:
            return 2;
        case 0x04: case 0x05: case 0x0A: case 0x0B: case 0x42: case 0x4B:
            return 3;
        case 0x3E: case 0x4C: case 0x4D: case 0x4E: case 0x4F: case 0x50:
            return 4;
    }

    if (id >= 0x15 && id <= 0x2F) {
        return 1;
    }

    return -1;
}

bool BTHome::decode(const uint8_t* data, size_t length, Measurement& measurement) {
    if (length < 1) {
        return false;
    }

    uint8_t info = data[0];
    bool encrypted = info & 0x01;
    bool has_mac = info & 0x02;
    uint8_t version = info >> 5;

    if (encrypted || version != 2) {
        return false;
    }

    size_t i = has_mac ? 7 : 1;

    while (i < length) {
        uint8_t id = data[i++];
        int size = objectLength(id);

        if (size < 0 || i + size > length) {
            break;
        }

        const uint8_t* value = data + i;
        uint16_t raw = size >= 2 ? value[0] | value[1] << 8 : value[0];

        switch (id) {
            case 0x00:
                measurement.has_packet_id = true;
                measurement.packet_id = value[0];
                break;
            case 0x01:
                measurement.has_battery = true;
                measurement.battery = value[0];
                break;
            case 0x02:
                measurement.has_temperature = true;
                measurement.temperature = static_cast<int16_t>(raw) / 100.0;
                break;
            case 0x03:
                measurement.has_humidity = true;
                measurement.humidity = raw / 100.0;
                break;
            case 0x0C:
                measurement.has_voltage = true;
                measurement.voltage = raw / 1000.0;
                break;
            case 0x2E:
                measurement.has_humidity = true;
                measurement.humidity = value[0];
                break;
            case 0x45:
                measurement.has_temperature = true;
                measurement.temperature = static_cast<int16_t>(raw) / 10.0;
                break;
        }

        i += size;
    }

    return true;
}