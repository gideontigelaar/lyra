# Lyra website
The dashboard on [lyra.gideontigelaar.com](https://lyra.gideontigelaar.com), built with Astro, React and Tailwind.

## Developing
Needs Node.js 22.23.4 or newer. In `website/`:
```bash
npm install
npm run dev
```

The dev server runs on the sample data in `src/lib/demo.ts`, so there's no need to sign in. It's the same data as "Try the demo" on the sign-in page.

`npm run check` checks the types.

## Deploying
In `website/`:
```bash
npm run build
rsync -av --delete dist/ debian-server:/var/www/lyra.gideontigelaar.com/
```

Add `--dry-run` first to see what would change. Files deleted locally are deleted on the server too.

## Good to know
- It's a static site. `public/.htaccess` sets caching and security headers, and Astro adds a Content-Security-Policy to every page. The inline scripts live in `src/scripts/inline.mjs` so their hashes make it into that policy.
- The app is one React page that switches views without reloading, see `src/components/App.tsx`. Addresses read like `/sensors/1/temperature/data/`. Everything under `/summary/`, `/sensors/` and `/sources/` is served by that section's page, through `FallbackResource` in the `.htaccess` files in `public/` on the server and a small plugin in `astro.config.mjs` in development.
- Summary, Sensors and Sources are tabs, like in an iOS app. A card opens its page in Summary's tab, under `/summary/`, so the tab stays on Summary and Back returns to it. Back always goes to the page you came from. Each tab reopens on the page it was left on for as long as the browser tab is open, and choosing the tab you're in goes back to its first page.
- Signing in uses passkeys and only works on the live site. The first passkey needs a setup code, see the [API README](../api/README.md). The sign-in page only shows that option while a code is waiting.
- The browser remembers that it's signed in, so signed-out visitors land on the sign-in page without the dashboard flashing first.
- Settings has the theme, °C or °F, the time zone, passkeys and sessions. Units and time zone are saved per account. The time zone follows the device, or one from the short list in `src/lib/zones.ts`.
- Summary shows the cards you add: values of a sensor, the average of a value over up to 3 sensors, or the batteries of up to 6 sensors. A small card fits 3 values, or 2 with their graphs, a large one 6. Change those limits in `MAX_PER_CARD` and `valueLimit` in `src/lib/cards.ts`. Batteries never get a graph, only their level as a bar.
- Cards follow each other row by row. The only gap is where a large card doesn't fit in what's left of a row. In edit mode a mouse drags a card straight away and a finger holds it a moment first. An outline shows where it lands and the other cards move aside. The corner button resizes, the minus removes, the plus adds a card, and tapping a card changes what it shows and whether it has a graph. Undo and Redo step through the changes.
- An average card and a batteries card of more sensors open a page of their own, with the average's chart or every battery.
- Without saved cards, Summary has a card per value for a single sensor, or a card per sensor when there are more. Above the cards it only lists what needs attention: an offline source, a sensor that went quiet or a low battery.
- A sensor's page has a chart of the chosen value per hour, day, week, month, 6 months or year. The line is the average and the band runs from lowest to highest. All Recorded Data lists days or single readings, and can delete them.
- A source's Diagnostics show the health it reports every 5 minutes.
- `src/lib/metrics.ts` sets each value's label, icon, decimals and colour. Battery only shows outside a sensor's page and the Batteries card when it's low, battery voltage only under a sensor's Details.
- Animations only use Tailwind's own utilities. Changing the theme crossfades the page with a view transition where the browser has one.
- Errors and confirmations, like a copy, a removal or pinning, show as alerts floating at the top, see `src/lib/toast.ts`. The page itself only says when something is loading or empty.
- The wordmark is Bricolage Grotesque turned into outlines, so no font gets loaded. Text uses the system font.
- Search engines are asked not to index it.