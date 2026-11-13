# Lyra
Keeps track of the Bluetooth sensors around the house. ESP32-C6 boards pick up the sensors and pass their readings to an API, and a website shows them.

- [`api/`](api/README.md): stores the readings
- [`website/`](website/README.md): shows them
- [`firmware/`](firmware/README.md): runs on the boards

## Setup
The API and the website run on two subdomains of one domain, like `api.example.com` and `lyra.example.com`. Put yours in:
- `api/lib/http.php`: `WEBSITE_ORIGIN`
- `website/src/lib/api.ts`: `API_URL`
- `website/astro.config.mjs`: `site`, and the API's domain in `connect-src`
- `firmware/include/config.h`: `API_URL`

Then set up the API, the website and a board, in that order.