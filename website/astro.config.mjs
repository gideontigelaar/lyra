import { createHash } from 'node:crypto';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import mockApi from './mock/api.mjs';
import { signInScript, themeScript } from './src/scripts/inline.mjs';

const hash = (script) => `sha256-${createHash('sha256').update(script).digest('base64')}`;

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
    plugins: [tailwindcss(), mockApi()],
    build: {
      cssTarget: ['chrome111', 'edge111', 'firefox128', 'safari16.4', 'ios16.4'],
    },
  },
});