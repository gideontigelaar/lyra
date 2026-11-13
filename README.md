# Lyra
Keeps track of the Bluetooth sensors around the house. ESP32-C6 boards pick up the sensors' broadcasts and pass them on to an API, which stores the readings for a website to show.

- [`firmware/`](firmware/README.md): runs on the boards
- [`api/`](api/README.md): decodes and stores the readings
- [`website/`](website/README.md): shows them

The API and the website each run on a subdomain of the same domain, like `api.example.com` and `lyra.example.com`, as the sign-in cookie only goes to the API from the same site. Set yours in:
- `firmware/include/config.h`: `API_URL`
- `api/lib/http.php`: `WEBSITE_ORIGIN`
- `website/src/lib/api.ts`: `API_URL`
- `website/astro.config.mjs`: `site`, and the API's domain in `connect-src`