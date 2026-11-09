#include "ble_scanner.h"
#include "config.h"
#include "logger.h"

void BleScanner::init() {
    _queue = xQueueCreate(32, sizeof(SensorReading));

    NimBLEDevice::init("");

    NimBLEScan* scan = NimBLEDevice::getScan();
    scan->setScanCallbacks(this, true);
    scan->setDuplicateFilter(0);
    scan->setMaxResults(0);
    scan->setActiveScan(false);
    scan->setInterval(Config::Scan::INTERVAL_MS);
    scan->setWindow(Config::Scan::WINDOW_MS);
    scan->start(0, false, true);

    LOG_INFO("Scanner: Listening for BTHome sensors");
}

bool BleScanner::next(SensorReading& reading, uint32_t wait_ms) {
    return xQueueReceive(_queue, &reading, pdMS_TO_TICKS(wait_ms)) == pdTRUE;
}

void BleScanner::onResult(const NimBLEAdvertisedDevice* device) {
    std::string data = device->getServiceData(NimBLEUUID(BTHome::SERVICE_UUID));

    if (data.empty()) {
        return;
    }

    SensorReading reading = {};

    if (!BTHome::decode(reinterpret_cast<const uint8_t*>(data.data()), data.size(), reading.measurement)) {
        return;
    }

    const Measurement& m = reading.measurement;

    if (!m.has_temperature && !m.has_humidity && !m.has_battery && !m.has_voltage) {
        return;
    }

    snprintf(reading.address, sizeof(reading.address), "%s", device->getAddress().toString().c_str());
    reading.rssi = device->getRSSI();
    reading.received_ms = millis();

    xQueueSend(_queue, &reading, 0);
}

void BleScanner::onScanEnd(const NimBLEScanResults&, int) {
    NimBLEDevice::getScan()->start(0, false, true);
}