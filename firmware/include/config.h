#pragma once
#include <cstddef>
#include <cstdint>

namespace Config {
    namespace Scan {
        const uint16_t INTERVAL_MS = 160;
        const uint16_t WINDOW_MS   = 80;
    }

    namespace Network {
        const char* const API_URL = "https://api.gideontigelaar.com/lyra";

        const uint32_t WIFI_RETRY_MS     = 15000;
        const uint32_t RETRY_MS          = 10000;
        const uint32_t SENSOR_REFRESH_MS = 300000;
        const uint32_t TELEMETRY_MS      = 300000;
        const uint16_t TIMEOUT_MS        = 10000;
        const size_t   MAX_PENDING       = 500;
        const size_t   MAX_BATCH         = 20;
    }

    const size_t   MAX_SENSORS    = 32;
    const uint32_t SERIAL_WAIT_MS = 3000;
}