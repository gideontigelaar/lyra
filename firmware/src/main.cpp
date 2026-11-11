#include <Arduino.h>
#include "relay.h"

Relay relay;

void setup() {
    relay.init();
}

void loop() {
    relay.poll();
}