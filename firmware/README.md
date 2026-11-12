# Lyra firmware
Runs on Seeed Studio XIAO ESP32-C6 boards. A board listens for the Bluetooth broadcasts of its sensors and passes them on to the API, which decodes them.

## Before you start
- VS Code with the PlatformIO IDE extension
- The source added on the website, for its key
- The sensors added on the website and assigned to this source

## Setup
Copy the credentials template, then fill in the Wi-Fi network and the source's key:
```bash
cp include/credentials.h.template include/credentials.h
```

## Building
Open `firmware/` as its own folder in VS Code. Use the PlatformIO buttons in the status bar, or run these in the PlatformIO terminal:
```bash
pio run              # build
pio run -t upload    # build and flash over USB
pio device monitor   # show the serial output
```

If flashing fails, hold the BOOT button while plugging in the board.

## How it works
The board knows nothing about sensor types. It gets the MAC addresses of its sensors from the API and forwards their raw broadcasts, so a new sensor or sensor type never needs a firmware update.

- The ESP32-C6 only does 2.4 GHz Wi-Fi.
- The sensor list is fetched once Wi-Fi connects, then every 5 minutes. Broadcasts from other devices are ignored.
- A sensor is relayed at most as often as its shortest recording interval.
- While the API can't be reached, up to 500 broadcasts are kept, about 5 days for one sensor. After that the oldest go. Once the API is back they're sent in batches of 20.
- Every 5 minutes the board reports its own health, which the website shows under a source's Diagnostics: uptime, restarts and why the last one happened, Wi-Fi signal and reconnects, free memory, chip temperature, queued and dropped broadcasts, and when the firmware was built. The restart count is kept in flash.
- It uses the `huge_app` partition layout: 3 MB for the firmware and no over-the-air updates.