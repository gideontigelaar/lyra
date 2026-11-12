# Lyra website
Website that shows the collected data.

Runs on [lyra.gideontigelaar.com](https://lyra.gideontigelaar.com).

## Requirements
- Node.js 22.23.4 or newer (26 LTS recommended)

## Developing
Run in `website/`:
```bash
npm install
npm run dev
```

The dev server answers API requests with sample data from `mock/api.mjs`, so it works without signing in.

Check the types:
```bash
npm run check
```

## Deploying
Build, then upload `dist/`. Run in `website/`:
```bash
npm run build
rsync -av --delete dist/ debian-server:/var/www/lyra.gideontigelaar.com/
```

Add `--dry-run` to see what would change first. Files deleted locally are also deleted on the server.

## Notes
- The site is static. `public/.htaccess` sets its caching and security headers, and Astro adds a Content-Security-Policy to every page.
- Signing in only works with passkeys, on the live site. The first passkey is created with a setup code, see the [API README](../api/README.md). More can be added in Settings. The last passkey can't be removed, and removing the one you signed in with signs you out.
- Summary shows the cards you pin: a whole sensor, one of its values, or the batteries of all sensors. Large cards add a graph of the last 24 hours, which can be turned off per card. By default it has a card per value when there's one sensor, and a card per sensor when there are more. Above the cards it only lists what needs attention: an offline source, a sensor that stopped reporting, or a low battery. Edit works like Apple Home: drag to reorder, the corner handle resizes, the minus removes, + adds, and Undo and Redo step through changes. Saving the default layout clears the saved one, so new sensors show up by themselves again.
- Tapping a card opens its sensor. A sensor's page shows its latest values, with a chart of the chosen one for the hour, day, week, month, 6 months or year, in local time. The line is the average and the band runs from the lowest to the highest reading. Each point is an hour for a day or week, and a day for longer periods. All Recorded Data lists days or single readings, which can be deleted.
- Sensors and Sources are managed on the site. Adding a source shows its key once, for `firmware/include/credentials.h`.
- `src/lib/metrics.ts` sets each value's label, icon, decimals and colour, other values get defaults. Battery shows on a sensor's page and the Batteries card, and elsewhere only when it's low. Battery voltage only shows under a sensor's Details.
- The wordmark is the word Lyra in Bricolage Grotesque, converted to outlines, so no font is loaded. Text uses the system font.
- Search engines are asked not to index it.