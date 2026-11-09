#include "sensor_gateway.h"
#include "config.h"
#include "logger.h"
#include <Arduino.h>

void SensorGateway::init() {
    Serial.begin(115200);

    while (!Serial && millis() < Config::SERIAL_WAIT_MS) {
        delay(10);
    }

    LOG_INFO("=== Lyra Sensor Gateway ===");

    _scanner.init();
}

void SensorGateway::poll() {
    SensorReading reading;

    while (_scanner.next(reading, 100)) {
        logReading(reading);
    }
}

void SensorGateway::logReading(const SensorReading& reading) {
    const Measurement& m = reading.measurement;
    char line[160];
    int length = snprintf(line, sizeof(line), "%s #%u (%d dBm):", reading.address, m.packet_id, reading.rssi);
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