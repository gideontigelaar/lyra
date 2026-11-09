#pragma once

#include "sensors/bthome.h"
#include <NimBLEDevice.h>

struct SensorReading {
    char        address[18];
    Measurement measurement;
    int8_t      rssi;
    uint32_t    received_ms;
};

class BleScanner : public NimBLEScanCallbacks {
public:
    void init();
    bool next(SensorReading& reading, uint32_t wait_ms);

private:
    QueueHandle_t _queue = nullptr;

    void onResult(const NimBLEAdvertisedDevice* device) override;
    void onScanEnd(const NimBLEScanResults& results, int reason) override;
};