#include <Arduino.h>
#include "config.h"
#include "logger.h"

void setup() {
    Serial.begin(115200);

    while (!Serial && millis() < Config::SERIAL_WAIT_MS) {
        delay(10);
    }

    LOG_INFO("=== Lyra Sensor Gateway ===");
}

void loop() {
}