#include "sensor_gateway.h"
#include "config.h"
#include "logger.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <strings.h>

void SensorGateway::init() {
    Serial.begin(115200);

    while (!Serial && millis() < Config::SERIAL_WAIT_MS) {
        delay(10);
    }

    LOG_INFO("=== Lyra Sensor Gateway ===");

    _api.init();
    _scanner.init();
}

void SensorGateway::poll() {
    SensorReading reading;
    uint32_t wait_ms = 100;

    while (_scanner.next(reading, wait_ms)) {
        wait_ms = 0;
        Sensor* sensor = findSensor(reading.address);

        if (sensor == nullptr || !isNewPacket(*sensor, reading.measurement)) {
            continue;
        }

        snprintf(reading.address, sizeof(reading.address), "%s", sensor->address.c_str());
        logReading(reading, sensor->name.c_str());
        addPending(reading);
    }

    _api.poll(millis());
    refreshSensors();
    sendPending();
}

SensorGateway::Sensor* SensorGateway::findSensor(const char* address) {
    for (Sensor& sensor : _sensors) {
        if (strcasecmp(sensor.address.c_str(), address) == 0) {
            return &sensor;
        }
    }

    return nullptr;
}

bool SensorGateway::isNewPacket(Sensor& sensor, const Measurement& m) {
    if (!m.has_packet_id) {
        return true;
    }

    int kind = (m.has_temperature || m.has_humidity) ? 0 : 1;

    if (sensor.last_packet_id[kind] == m.packet_id) {
        return false;
    }

    sensor.last_packet_id[kind] = m.packet_id;
    return true;
}

void SensorGateway::refreshSensors() {
    if (!_api.isConnected() || millis() - _last_refresh_ms < _refresh_interval_ms) {
        return;
    }

    String response;
    ApiClient::Result result = _api.get("/device/sensors", response);
    _last_refresh_ms = millis();

    _refresh_interval_ms = result == ApiClient::Result::FAILED ? Config::Network::RETRY_MS : Config::Network::SENSOR_REFRESH_MS;

    if (result != ApiClient::Result::OK) {
        return;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (error) {
        LOG_ERROR("Gateway: Invalid sensor list (%s)", error.c_str());
        return;
    }

    std::vector<Sensor> sensors;

    for (JsonObjectConst item : doc["sensors"].as<JsonArrayConst>()) {
        Sensor sensor;
        sensor.address = item["address"] | "";
        sensor.name = item["name"] | "";

        if (const Sensor* known = findSensor(sensor.address.c_str())) {
            sensor.last_packet_id[0] = known->last_packet_id[0];
            sensor.last_packet_id[1] = known->last_packet_id[1];
        }

        sensors.push_back(sensor);
    }

    if (!_sensors_loaded || sensors.size() != _sensors.size()) {
        LOG_INFO("Gateway: Forwarding %u sensor(s)", (unsigned)sensors.size());
    }

    _sensors = std::move(sensors);
    _sensors_loaded = true;
}

void SensorGateway::addPending(const SensorReading& reading) {
    if (_pending.size() >= Config::Network::MAX_PENDING) {
        LOG_WARN("Gateway: Queue full, dropping oldest reading");
        _pending.pop_front();
    }

    _pending.push_back(reading);
}

void SensorGateway::sendPending() {
    if (_pending.empty() || !_api.isConnected()) {
        return;
    }

    if (_send_failed && millis() - _last_failed_send_ms < Config::Network::RETRY_MS) {
        return;
    }

    String payload = buildPayload(_pending.front(), millis());

    switch (_api.post("/readings", payload.c_str())) {
        case ApiClient::Result::OK:
            _pending.pop_front();
            _send_failed = false;
            LOG_INFO("Network: Sent reading (%u pending)", (unsigned)_pending.size());
            break;

        case ApiClient::Result::REJECTED:
            _pending.pop_front();
            _send_failed = false;
            break;

        case ApiClient::Result::FAILED:
            _send_failed = true;
            _last_failed_send_ms = millis();
            break;
    }
}

void SensorGateway::logReading(const SensorReading& reading, const char* name) {
    const Measurement& m = reading.measurement;
    char line[160];
    int length = snprintf(line, sizeof(line), "%s #%u (%d dBm):", name, m.packet_id, reading.rssi);
    const char* separator = " ";

    if (m.has_temperature) {
        length += snprintf(line + length, sizeof(line) - length, "%stemperature %.2f °C", separator, m.temperature);
        separator = ", ";
    }

    if (m.has_humidity) {
        length += snprintf(line + length, sizeof(line) - length, "%shumidity %.2f %%", separator, m.humidity);
        separator = ", ";
    }

    if (m.has_battery) {
        length += snprintf(line + length, sizeof(line) - length, "%sbattery %u %%", separator, m.battery);
        separator = ", ";
    }

    if (m.has_voltage) {
        snprintf(line + length, sizeof(line) - length, "%svoltage %.3f V", separator, m.voltage);
    }

    LOG_INFO("Scanner: %s", line);
}

String SensorGateway::buildPayload(const SensorReading& reading, uint32_t now_ms) {
    const Measurement& m = reading.measurement;
    JsonDocument doc;

    doc["sensor"] = reading.address;
    doc["age"] = (now_ms - reading.received_ms) / 1000;

    JsonObject values = doc["readings"].to<JsonObject>();

    if (m.has_temperature) {
        values["temperature"] = m.temperature;
    }

    if (m.has_humidity) {
        values["humidity"] = m.humidity;
    }

    if (m.has_battery) {
        values["battery"] = m.battery;
    }

    if (m.has_voltage) {
        values["voltage"] = m.voltage;
    }

    String payload;
    serializeJson(doc, payload);
    return payload;
}