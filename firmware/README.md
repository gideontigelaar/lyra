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
- A sensor is relayed at most as often as the API says, which is once a minute, so values a sensor sends in broadcasts of their own all get there.
- While the API can't be reached, the board keeps one of each kind of broadcast a sensor sends per its shortest recording interval, in flash, so they also last through a restart. Kinds are told apart by how a broadcast is laid out, like pvvx's with temperature and humidity and its one with the battery. They're kept up to 7 days, as long as the API takes them, which flash has room for with about 9 sensors like that. Once the API is back they're sent oldest first, in batches of 20. Flash is only written while the API can't be reached.
- The clock is set over NTP from `pool.ntp.org`, so kept broadcasts get the right time.
- Every 5 minutes the board reports its own health, which the website shows under a source's Diagnostics: uptime, restarts and why the last one happened, Wi-Fi signal and reconnects, free memory, chip temperature, queued and dropped broadcasts, and when the firmware was built. The restart count is kept in flash, the other counts start over when the board restarts, and the API turns them into counts of the last 7 days.
- It uses the `huge_app` partition layout: 3 MB for the firmware and no over-the-air updates.