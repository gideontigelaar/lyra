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
#include <cstring>
#include <ctime>
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

// What kind of broadcast this is, from how it's laid out and not from its values: the length and type of each part, and whose
// service or company data it carries. A sensor that spreads its values over broadcasts, like pvvx with the battery in one of
// its own, sends kinds that differ.
static uint32_t kindOf(const Advert& advert) {
    uint32_t hash = 2166136261u;
    auto mix = [&hash](uint8_t byte) { hash = (hash ^ byte) * 16777619u; };

    for (size_t offset = 0; offset + 1 < advert.length;) {
        uint8_t length = advert.data[offset];

        if (length == 0 || offset + 1 + length > advert.length) {
            break;
        }

        uint8_t type = advert.data[offset + 1];
        mix(length);
        mix(type);

        if ((type == 0x16 || type == 0xFF) && length >= 3) {
            mix(advert.data[offset + 2]);
            mix(advert.data[offset + 3]);
        }

        offset += 1 + length;
    }

    return hash;
}

static void addAdvert(JsonArray adverts, const char* address, const uint8_t* data, uint8_t length, int8_t rssi, uint32_t age) {
    char hex[sizeof(Advert::data) * 2 + 1] = "";

    for (size_t i = 0; i < length; i++) {
        snprintf(hex + i * 2, 3, "%02x", data[i]);
    }

    JsonObject item = adverts.add<JsonObject>();
    item["address"] = address;
    item["data"] = hex;
    item["rssi"] = rssi;
    item["age"] = age;
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

    _store.init();
    _api.init();
    // The clock dates broadcasts kept in flash, so they get the right time also after a restart.
    configTime(0, 0, Config::Network::NTP_SERVER);
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

bool Relay::online() const {
    return _api.isConnected() && !_send_failed;
}

// While the API can be reached, a sensor is relayed as often as it says. While it can't, each kind of broadcast is kept
// once per offline interval, the sensor's shortest recording interval, so flash holds days of them and none of its values go missing.
bool Relay::keep(Sensor& sensor, const Advert& advert) {
    if (online()) {
        if (sensor.relayed && advert.received_ms - sensor.last_relay_ms < sensor.interval_ms) {
            return false;
        }

        sensor.relayed = true;
        sensor.last_relay_ms = advert.received_ms;
        return true;
    }

    uint32_t signature = kindOf(advert);
    auto kind = std::find_if(sensor.kinds.begin(), sensor.kinds.end(), [signature](const Kind& item) { return item.signature == signature; });

    if (kind != sensor.kinds.end()) {
        if (advert.received_ms - kind->last_ms < sensor.offline_interval_ms) {
            return false;
        }
    } else if (sensor.kinds.size() < Config::MAX_KINDS) {
        sensor.kinds.push_back({signature, 0});
        kind = sensor.kinds.end() - 1;
    } else {
        kind = std::min_element(sensor.kinds.begin(), sensor.kinds.end(), [](const Kind& a, const Kind& b) { return a.last_ms < b.last_ms; });
        kind->signature = signature;
    }

    kind->last_ms = advert.received_ms;
    return true;
}

void Relay::handle(const Advert& advert) {
    Sensor* sensor = findSensor(advert.address);

    if (sensor == nullptr || !keep(*sensor, advert)) {
        return;
    }

    if (_pending.size() >= Config::Network::MAX_PENDING) {
        LOG_WARN("Relay: Queue full, dropping oldest advert");
        _pending.pop_front();
        _dropped++;
    }

    _pending.push_back(advert);
    LOG_INFO("Relay: Queued %s (%d dBm, %u pending)", advert.address, advert.rssi, (unsigned)_pending.size());
}

// Moves the broadcasts waiting in memory to flash, once the clock can date them.
void Relay::spill(uint32_t now_ms) {
    time_t now = time(nullptr);

    if (_pending.empty() || now < Config::VALID_TIME || !_store.ready()) {
        return;
    }

    std::vector<AdvertStore::Record> records;
    records.reserve(_pending.size());

    for (const Advert& advert : _pending) {
        AdvertStore::Record record = {};
        record.received_at = advert.received_at ? advert.received_at : static_cast<uint32_t>(now - (now_ms - advert.received_ms) / 1000);
        memcpy(record.address, advert.address, sizeof(record.address));
        memcpy(record.data, advert.data, sizeof(record.data));
        record.length = advert.length;
        record.rssi = advert.rssi;
        records.push_back(record);
    }

    _dropped += _store.add(records.data(), records.size());
    _pending.clear();
    LOG_INFO("Relay: Kept %u advert(s) in flash (%u waiting)", (unsigned)records.size(), (unsigned)_store.count());
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
        uint32_t interval = item["interval"] | 0u;
        sensor.interval_ms = std::min<uint32_t>(interval, UINT32_MAX / 1000) * 1000;
        sensor.offline_interval_ms = std::min<uint32_t>(item["offline_interval"] | interval, UINT32_MAX / 1000) * 1000;

        const Sensor* known = findSensor(sensor.address.c_str());

        if (known != nullptr) {
            sensor.relayed = known->relayed;
            sensor.last_relay_ms = known->last_relay_ms;
            sensor.kinds = known->kinds;
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

// Sends what's waiting, oldest first: what's in flash, then what's in memory. While the API can't be reached, memory goes to flash.
void Relay::send(uint32_t now_ms) {
    if (_pending.empty() && _store.count() == 0) {
        return;
    }

    if (!_api.isConnected() || (_send_failed && now_ms - _last_failed_send_ms < Config::Network::RETRY_MS)) {
        spill(now_ms);
        return;
    }

    time_t now = time(nullptr);
    bool from_store = _store.count() > 0;
    AdvertStore::Record records[Config::Network::MAX_BATCH];
    size_t count = 0;
    JsonDocument doc;
    JsonArray adverts = doc["adverts"].to<JsonArray>();

    if (from_store) {
        // Their age needs the clock, which is set soon after Wi-Fi connects.
        if (now < Config::VALID_TIME) {
            return;
        }

        count = _store.peek(records, Config::Network::MAX_BATCH);
        size_t expired = 0;

        while (expired < count && now - records[expired].received_at >= Config::Store::MAX_AGE_S - 60) {
            expired++;
        }

        // Too old for the API, or a file that can't be read.
        if (expired > 0 || count == 0) {
            size_t gone = expired > 0 ? expired : _store.dropOldest();

            if (expired > 0) {
                _store.pop(expired);
            }

            _dropped += gone;
            LOG_WARN("Relay: Dropped %u advert(s) from flash", (unsigned)gone);
            return;
        }

        for (size_t i = 0; i < count; i++) {
            uint32_t age = now > records[i].received_at ? now - records[i].received_at : 0;
            addAdvert(adverts, records[i].address, records[i].data, records[i].length, records[i].rssi, age);
        }
    } else {
        count = std::min(_pending.size(), Config::Network::MAX_BATCH);

        for (size_t i = 0; i < count; i++) {
            const Advert& advert = _pending[i];
            addAdvert(adverts, advert.address, advert.data, advert.length, advert.rssi, (now_ms - advert.received_ms) / 1000);
        }
    }

    String json;
    serializeJson(doc, json);
    SendResult result = _api.post("/device/adverts", json.c_str());

    if (result == SendResult::FAILED) {
        _send_failed = true;
        _last_failed_send_ms = now_ms;
        spill(now_ms);
        return;
    }

    if (from_store) {
        _store.pop(count);
    } else {
        _pending.erase(_pending.begin(), _pending.begin() + count);
    }

    _send_failed = false;

    if (result == SendResult::OK) {
        LOG_INFO("Relay: Sent %u advert(s) (%u waiting)", (unsigned)count, (unsigned)(_pending.size() + _store.count()));
    } else {
        LOG_WARN("Relay: API rejected %u advert(s)", (unsigned)count);
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
    doc["pending"] = static_cast<unsigned>(_pending.size() + _store.count());
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