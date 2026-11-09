#pragma once
#include <cstddef>
#include <cstdint>

namespace Config {
    namespace Scan {
        const uint16_t INTERVAL_MS = 160;
        const uint16_t WINDOW_MS   = 80;
    }

    const uint32_t SERIAL_WAIT_MS = 3000;
}