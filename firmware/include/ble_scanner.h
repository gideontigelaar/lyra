#pragma once

#include "config.h"
#include <NimBLEDevice.h>
#include <WString.h>
#include <vector>

struct Advert {
    char     address[18];
    uint8_t  data[31];
    uint8_t  length;
    int8_t   rssi;
    uint32_t received_ms;
    // Unix time, or 0 while the clock isn't set.
    uint32_t received_at;
};

class BleScanner : public NimBLEScanCallbacks {
public:
    void init();
    void watch(const std::vector<String>& addresses);
    bool next(Advert& advert, uint32_t wait_ms);

private:
    QueueHandle_t _queue = nullptr;
    portMUX_TYPE  _lock  = portMUX_INITIALIZER_UNLOCKED;
    uint8_t       _addresses[Config::MAX_SENSORS][6] = {};
    size_t        _count = 0;

    void onResult(const NimBLEAdvertisedDevice* device) override;
    void onScanEnd(const NimBLEScanResults& results, int reason) override;
};