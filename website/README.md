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
- The wordmark is the word Lyra in Bricolage Grotesque, converted to outlines, so no font is loaded. Text uses the system font.
- Search engines are asked not to index it.