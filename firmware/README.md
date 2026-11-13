# Lyra firmware
For Seeed Studio XIAO ESP32-C6 boards. A board listens to its sensors over Bluetooth and sends what they broadcast to the API.

## Before you start
- VS Code with the PlatformIO IDE extension
- A source added on the website, for its key
- Its sensors added on the website

## Setup
In `firmware/`, copy the template, then fill in your Wi-Fi and the source's key. The board only does 2.4 GHz Wi-Fi.
```bash
cp include/credentials.h.template include/credentials.h
```

## Flash
Open `firmware/` as its own folder in VS Code, plug in the board and run in the PlatformIO terminal:
```bash
pio run -t upload    # build and flash over USB
pio device monitor   # show the serial output
```

If flashing fails, hold the BOOT button while plugging in the board.