#include <Arduino.h>
#include "sensor_gateway.h"

SensorGateway gateway;

void setup() {
    gateway.init();
}

void loop() {
    gateway.poll();
}