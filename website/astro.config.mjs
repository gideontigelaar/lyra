import { createHash } from 'node:crypto';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { signInScript, themeScript } from './src/scripts/inline.mjs';

const hash = (script) => `sha256-${createHash('sha256').update(script).digest('base64')}`;

// Serves every address under /sensors/ and /sources/ with that section's page, like public/*/.htaccess does on the server.
const appAddresses = {
  name: 'app-addresses',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const section = req.url?.match(/^\/(sensors|sources)\/[^?]+/)?.[1];

      if (section) {
        req.url = `/${section}/`;
      }

      next();
    });
  },
};

export default defineConfig({
  site: 'https://lyra.gideontigelaar.com',
  integrations: [react()],
  build: {
    inlineStylesheets: 'always',
  },
  security: {
    csp: {
      directives: ["default-src 'self'", "img-src 'self' data:", "connect-src 'self' https://api.gideontigelaar.com"],
      scriptDirective: {
        hashes: [themeScript, signInScript].map(hash),
      },
    },
  },
  vite: {
    plugins: [tailwindcss(), appAddresses],
    build: {
      cssTarget: ['chrome111', 'edge111', 'firefox128', 'safari16.4', 'ios16.4'],
    },
  },
});