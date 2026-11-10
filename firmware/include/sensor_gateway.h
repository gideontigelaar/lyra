#pragma once

#include "ble_scanner.h"
#include "api_client.h"
#include <WString.h>
#include <deque>
#include <vector>

class SensorGateway {
public:
    void init();
    void poll();

private:
    struct Sensor {
        String   address;
        String   name;
        bool     reported[2]       = {false, false};
        uint32_t last_report_ms[2] = {0, 0};
    };

    BleScanner _scanner;
    ApiClient  _api;

    std::vector<Sensor> _sensors;
    bool     _sensors_loaded      = false;
    uint32_t _last_refresh_ms     = 0;
    uint32_t _refresh_interval_ms = 0;

    std::deque<SensorReading> _pending;

    bool     _send_failed         = false;
    uint32_t _last_failed_send_ms = 0;

    Sensor* findSensor(const char* address);
    bool    isDue(Sensor& sensor, const SensorReading& reading);
    void    refreshSensors();
    void    addPending(const SensorReading& reading);
    void    sendPending();
    void    logReading(const SensorReading& reading, const char* name);
    String  buildPayload(const SensorReading& reading, uint32_t now_ms);
};