# Lyra website
The dashboard, built with Astro, React and Tailwind.

## Develop
Needs Node.js 22.23.4 or newer. In `website/`:
```bash
npm install
npm run dev
```

The dev server uses sample data, so you don't need to sign in. `npm run check` checks the types.

## Deploy
Needs Apache 2.4 that allows `.htaccess` files, as they route the pages and set the headers. `SERVER` is how you reach the server over SSH and `WEBSITE_FOLDER` is the folder the site is served from, like `/var/www/lyra.example.com`.

In `website/`, also for every update:
```bash
npm run build
rsync -av --delete dist/ SERVER:WEBSITE_FOLDER/
```