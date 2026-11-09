#pragma once
#include <cstddef>
#include <cstdint>

struct Measurement {
    bool    has_packet_id   = false;
    uint8_t packet_id       = 0;
    bool    has_temperature = false;
    double  temperature     = 0.0;
    bool    has_humidity    = false;
    double  humidity        = 0.0;
    bool    has_battery     = false;
    uint8_t battery         = 0;
    bool    has_voltage     = false;
    double  voltage         = 0.0;
};

namespace BTHome {
    const uint16_t SERVICE_UUID = 0xFCD2;

    bool decode(const uint8_t* data, size_t length, Measurement& measurement);
}