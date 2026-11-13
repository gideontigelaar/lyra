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

        const char* const NTP_SERVER = "pool.ntp.org";

        const uint32_t WIFI_RETRY_MS     = 15000;
        const uint32_t RETRY_MS          = 10000;
        const uint32_t SENSOR_REFRESH_MS = 300000;
        const uint32_t TELEMETRY_MS      = 300000;
        const uint16_t TIMEOUT_MS        = 10000;
        const size_t   MAX_PENDING       = 200;
        const size_t   MAX_BATCH         = 20;
    }

    namespace Store {
        // As long as the API takes a broadcast after it was heard.
        const uint32_t MAX_AGE_S = 7 * 24 * 3600;
        const size_t   PER_FILE  = 128;
    }

    // A Unix time before this means the clock isn't set yet.
    const uint32_t VALID_TIME = 1700000000;
    // The kinds of broadcast told apart for each sensor while the API can't be reached.
    const size_t   MAX_KINDS  = 8;

    const size_t   MAX_SENSORS    = 32;
    const uint32_t SERIAL_WAIT_MS = 3000;
}