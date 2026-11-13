#include "ble_scanner.h"
#include "logger.h"
#include <cstdio>
#include <cstring>
#include <ctime>

void BleScanner::init() {
    _queue = xQueueCreate(32, sizeof(Advert));

    NimBLEDevice::init("");

    NimBLEScan* scan = NimBLEDevice::getScan();
    scan->setScanCallbacks(this, true);
    scan->setDuplicateFilter(0);
    scan->setMaxResults(0);
    scan->setActiveScan(false);
    scan->setInterval(Config::Scan::INTERVAL_MS);
    scan->setWindow(Config::Scan::WINDOW_MS);
    scan->start(0, false, true);

    LOG_INFO("Scanner: Listening");
}

void BleScanner::watch(const std::vector<String>& addresses) {
    uint8_t parsed[Config::MAX_SENSORS][6];
    size_t count = 0;

    for (const String& address : addresses) {
        unsigned int bytes[6];

        if (count == Config::MAX_SENSORS) {
            LOG_WARN("Scanner: Watching only the first %u sensors", (unsigned)Config::MAX_SENSORS);
            break;
        }

        if (sscanf(address.c_str(), "%2x:%2x:%2x:%2x:%2x:%2x", &bytes[5], &bytes[4], &bytes[3], &bytes[2], &bytes[1], &bytes[0]) != 6) {
            LOG_WARN("Scanner: Invalid address %s", address.c_str());
            continue;
        }

        for (size_t i = 0; i < 6; i++) {
            parsed[count][i] = bytes[i];
        }

        count++;
    }

    portENTER_CRITICAL(&_lock);
    memcpy(_addresses, parsed, count * sizeof(parsed[0]));
    _count = count;
    portEXIT_CRITICAL(&_lock);
}

bool BleScanner::next(Advert& advert, uint32_t wait_ms) {
    return xQueueReceive(_queue, &advert, pdMS_TO_TICKS(wait_ms)) == pdTRUE;
}

void BleScanner::onResult(const NimBLEAdvertisedDevice* device) {
    const uint8_t* address = device->getAddress().getVal();
    bool watched = false;

    portENTER_CRITICAL(&_lock);

    for (size_t i = 0; i < _count && !watched; i++) {
        watched = memcmp(_addresses[i], address, 6) == 0;
    }

    portEXIT_CRITICAL(&_lock);

    const std::vector<uint8_t>& payload = device->getPayload();

    if (!watched || payload.empty() || payload.size() > sizeof(Advert::data)) {
        return;
    }

    Advert advert = {};
    snprintf(advert.address, sizeof(advert.address), "%s", device->getAddress().toString().c_str());
    memcpy(advert.data, payload.data(), payload.size());
    advert.length = payload.size();
    advert.rssi = device->getRSSI();
    advert.received_ms = millis();
    time_t now = time(nullptr);
    advert.received_at = now >= Config::VALID_TIME ? static_cast<uint32_t>(now) : 0;

    xQueueSend(_queue, &advert, 0);
}

void BleScanner::onScanEnd(const NimBLEScanResults&, int) {
    NimBLEDevice::getScan()->start(0, false, true);
}