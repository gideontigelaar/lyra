#pragma once

#include "ble_scanner.h"

class SensorGateway {
public:
    void init();
    void poll();

private:
    BleScanner _scanner;

    void logReading(const SensorReading& reading);
};