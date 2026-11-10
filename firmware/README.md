# Lyra firmware
Firmware for the Seeed Studio XIAO ESP32-C6 boards. Reads the sensors and sends their data to the API.

## Requirements
- VS Code with the PlatformIO IDE extension
- The device and its sensors registered in the API, see [its README](../api/README.md)
- Sensors running the pvvx firmware, broadcasting BTHome v2 without encryption

## Setup
Copy the credentials template, then fill in the Wi-Fi network and the device's API key:
```bash
cp include/credentials.h.template include/credentials.h
```

## Building
Open `firmware/` as its own folder in VS Code, then use the PlatformIO buttons in the status bar, or run in the PlatformIO terminal:

Build:
```bash
pio run
```

Build and flash over USB:
```bash
pio run -t upload
```

Show the serial output:
```bash
pio device monitor
```

## Notes
- The ESP32-C6 only uses 2.4 GHz Wi-Fi.
- Sensors are loaded from the API once Wi-Fi is connected, then every 5 minutes. Readings from other sensors are ignored.
- Temperature, humidity and battery are sent every 15 minutes, voltage every hour.
- Up to 500 readings, about 4 days for one sensor, are kept while Wi-Fi or the API is down. After that the oldest are dropped.
- Uses the `huge_app` partition layout: 3 MB for the firmware, no over-the-air updates.
- If flashing fails, hold the BOOT button while plugging in the board.