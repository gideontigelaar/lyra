# Lyra firmware
Firmware for the Seeed Studio XIAO ESP32-C6 boards. Relays the Bluetooth broadcasts of your sensors to the API, which decodes them.

## Requirements
- VS Code with the PlatformIO IDE extension
- The source added on the website, which gives you its key
- Sensors added on the website and assigned to this source

## Setup
Copy the credentials template, then fill in the Wi-Fi network and the source's key:
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

## How it works
The board doesn't know sensor types. It downloads the MAC addresses of its sensors from the API and sends their raw broadcasts there, where they are decoded. A new sensor, or a new sensor type, never needs a firmware update.

## Notes
- The ESP32-C6 only uses 2.4 GHz Wi-Fi.
- Sensors are loaded from the API once Wi-Fi is connected, then every 5 minutes. Broadcasts from other devices are ignored.
- Each sensor is relayed at most as often as its shortest recording interval on the website.
- Up to 500 broadcasts are kept while the API can't be reached, about 5 days for one sensor. After that the oldest are dropped. They're sent in batches of 20 once it's back.
- Every 5 minutes the board reports its own health for troubleshooting: uptime, restarts and why the last one happened, Wi-Fi signal and reconnects, free memory, chip temperature, queued and dropped broadcasts, and when the firmware was built. The restart count is kept in flash.
- Uses the `huge_app` partition layout: 3 MB for the firmware, no over-the-air updates.
- If flashing fails, hold the BOOT button while plugging in the board.