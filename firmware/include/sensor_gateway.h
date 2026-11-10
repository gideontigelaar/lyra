#pragma once

#include "ble_scanner.h"
#include "api_client.h"
#include <WString.h>
#include <vector>

class SensorGateway {
public:
    void init();
    void poll();

private:
    struct Sensor {
        String address;
        String name;
        int    last_packet_id[2] = {-1, -1};
    };

    BleScanner _scanner;
    ApiClient  _api;

    std::vector<Sensor> _sensors;
    bool     _sensors_loaded      = false;
    uint32_t _last_refresh_ms     = 0;
    uint32_t _refresh_interval_ms = 0;

    Sensor* findSensor(const char* address);
    bool    isNewPacket(Sensor& sensor, const Measurement& measurement);
    void    refreshSensors();
    void    sendReading(const SensorReading& reading);
    void    logReading(const SensorReading& reading, const char* name);
    String  buildPayload(const SensorReading& reading);
};