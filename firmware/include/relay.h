#pragma once

#include "api_client.h"
#include "ble_scanner.h"
#include <WString.h>
#include <deque>
#include <vector>

class Relay {
public:
    void init();
    void poll();

private:
    struct Sensor {
        String   address;
        uint32_t interval_ms   = 0;
        bool     relayed       = false;
        uint32_t last_relay_ms = 0;
    };

    BleScanner          _scanner;
    ApiClient           _api;
    std::vector<Sensor> _sensors;
    std::deque<Advert>  _pending;

    bool     _sensors_loaded      = false;
    uint32_t _last_refresh_ms     = 0;
    uint32_t _refresh_interval_ms = 0;
    bool     _send_failed         = false;
    uint32_t _last_failed_send_ms = 0;
    uint32_t _dropped             = 0;
    uint32_t _boots               = 0;
    bool     _telemetry_sent      = false;
    uint32_t _last_telemetry_ms   = 0;

    Sensor* findSensor(const char* address);
    void    handle(const Advert& advert);
    void    refreshSensors();
    void    send(uint32_t now_ms);
    void    sendTelemetry(uint32_t now_ms);
};