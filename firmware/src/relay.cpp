#include "relay.h"
#include "config.h"
#include "logger.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>
#include <algorithm>
#include <climits>
#include <cmath>
#include <esp_system.h>
#include <esp_timer.h>
#include <strings.h>

static const char* resetReason() {
    static const char* const names[] = {
        "unknown", "power_on", "external", "software", "panic", "interrupt_watchdog", "task_watchdog", "watchdog",
        "deep_sleep", "brownout", "sdio", "usb", "jtag", "efuse", "power_glitch", "cpu_lockup",
    };
    int reason = esp_reset_reason();

    return reason >= 0 && reason < static_cast<int>(sizeof(names) / sizeof(names[0])) ? names[reason] : "unknown";
}

void Relay::init() {
    Serial.begin(115200);

    while (!Serial && millis() < Config::SERIAL_WAIT_MS) {
        delay(10);
    }

    Preferences preferences;
    preferences.begin("lyra");
    _boots = preferences.getUInt("boots", 0) + 1;
    preferences.putUInt("boots", _boots);
    preferences.end();

    LOG_INFO("=== Lyra Relay ===");
    LOG_INFO("Boot %u, last reset: %s", (unsigned)_boots, resetReason());

    _api.init();
    _scanner.init();
}

void Relay::poll() {
    Advert advert;
    uint32_t wait_ms = 100;

    while (_scanner.next(advert, wait_ms)) {
        wait_ms = 0;
        handle(advert);
    }

    _api.poll(millis());
    refreshSensors();
    send(millis());
    sendTelemetry(millis());
}

Relay::Sensor* Relay::findSensor(const char* address) {
    for (Sensor& sensor : _sensors) {
        if (strcasecmp(sensor.address.c_str(), address) == 0) {
            return &sensor;
        }
    }

    return nullptr;
}

void Relay::handle(const Advert& advert) {
    Sensor* sensor = findSensor(advert.address);

    if (sensor == nullptr || (sensor->relayed && advert.received_ms - sensor->last_relay_ms < sensor->interval_ms)) {
        return;
    }

    sensor->relayed = true;
    sensor->last_relay_ms = advert.received_ms;

    if (_pending.size() >= Config::Network::MAX_PENDING) {
        LOG_WARN("Relay: Queue full, dropping oldest advert");
        _pending.pop_front();
        _dropped++;
    }

    _pending.push_back(advert);
    LOG_INFO("Relay: Queued %s (%d dBm, %u pending)", advert.address, advert.rssi, (unsigned)_pending.size());
}

void Relay::refreshSensors() {
    if (!_api.isConnected() || millis() - _last_refresh_ms < _refresh_interval_ms) {
        return;
    }

    String response;
    SendResult result = _api.get("/device/sensors", response);
    _last_refresh_ms = millis();
    _refresh_interval_ms = result == SendResult::FAILED ? Config::Network::RETRY_MS : Config::Network::SENSOR_REFRESH_MS;

    if (result != SendResult::OK) {
        return;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (error) {
        LOG_ERROR("Relay: Invalid sensor list (%s)", error.c_str());
        return;
    }

    std::vector<Sensor> sensors;
    std::vector<String> addresses;

    for (JsonObjectConst item : doc["sensors"].as<JsonArrayConst>()) {
        Sensor sensor;
        sensor.address = item["address"] | "";
        sensor.interval_ms = std::min<uint32_t>(item["interval"] | 0u, UINT32_MAX / 1000) * 1000;

        const Sensor* known = findSensor(sensor.address.c_str());

        if (known != nullptr) {
            sensor.relayed = known->relayed;
            sensor.last_relay_ms = known->last_relay_ms;
        }

        sensors.push_back(sensor);
        addresses.push_back(sensor.address);
    }

    if (!_sensors_loaded || sensors.size() != _sensors.size()) {
        LOG_INFO("Relay: Relaying %u sensor(s)", (unsigned)sensors.size());
    }

    _sensors = std::move(sensors);
    _sensors_loaded = true;
    _scanner.watch(addresses);
}

void Relay::send(uint32_t now_ms) {
    if (_pending.empty() || !_api.isConnected() || (_send_failed && now_ms - _last_failed_send_ms < Config::Network::RETRY_MS)) {
        return;
    }

    size_t count = std::min(_pending.size(), Config::Network::MAX_BATCH);
    JsonDocument doc;
    JsonArray adverts = doc["adverts"].to<JsonArray>();
    char hex[sizeof(Advert::data) * 2 + 1];

    for (size_t i = 0; i < count; i++) {
        const Advert& advert = _pending[i];

        for (size_t j = 0; j < advert.length; j++) {
            snprintf(hex + j * 2, 3, "%02x", advert.data[j]);
        }

        JsonObject item = adverts.add<JsonObject>();
        item["address"] = advert.address;
        item["data"] = hex;
        item["rssi"] = advert.rssi;
        item["age"] = (now_ms - advert.received_ms) / 1000;
    }

    String json;
    serializeJson(doc, json);

    switch (_api.post("/device/adverts", json.c_str())) {
        case SendResult::OK:
            _pending.erase(_pending.begin(), _pending.begin() + count);
            _send_failed = false;
            LOG_INFO("Relay: Sent %u advert(s) (%u pending)", (unsigned)count, (unsigned)_pending.size());
            break;

        case SendResult::REJECTED:
            _pending.erase(_pending.begin(), _pending.begin() + count);
            _send_failed = false;
            LOG_WARN("Relay: API rejected %u advert(s)", (unsigned)count);
            break;

        case SendResult::FAILED:
            _send_failed = true;
            _last_failed_send_ms = now_ms;
            break;
    }
}

void Relay::sendTelemetry(uint32_t now_ms) {
    if (!_api.isConnected() || (_telemetry_sent && now_ms - _last_telemetry_ms < Config::Network::TELEMETRY_MS)) {
        return;
    }

    _telemetry_sent = true;
    _last_telemetry_ms = now_ms;

    JsonDocument doc;
    doc["uptime"] = static_cast<uint32_t>(esp_timer_get_time() / 1000000);
    doc["boots"] = _boots;
    doc["reset_reason"] = resetReason();
    doc["rssi"] = WiFi.RSSI();
    doc["wifi_reconnects"] = _api.reconnects();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["min_free_heap"] = ESP.getMinFreeHeap();
    doc["largest_block"] = ESP.getMaxAllocHeap();
    doc["pending"] = static_cast<unsigned>(_pending.size());
    doc["dropped"] = _dropped;
    doc["build"] = __DATE__ " " __TIME__;

    float temperature = temperatureRead();

    if (std::isfinite(temperature) && temperature >= -40 && temperature <= 125) {
        doc["temperature"] = std::round(temperature * 10) / 10;
    }

    String json;
    serializeJson(doc, json);
    _api.post("/device/telemetry", json.c_str());
}