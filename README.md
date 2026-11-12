# Lyra
Keeps track of the Bluetooth sensors around the house. ESP32-C6 boards pick up the sensors' broadcasts and pass them on to an API, which stores the readings for a website to show.

- [`firmware/`](firmware/README.md): runs on the boards
- [`api/`](api/README.md): decodes and stores the readings
- [`website/`](website/README.md): shows them, on [lyra.gideontigelaar.com](https://lyra.gideontigelaar.com)