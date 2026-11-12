import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://lyra.gideontigelaar.com',
  build: {
    inlineStylesheets: 'always',
  },
  security: {
    csp: {
      directives: ["default-src 'self'", "img-src 'self' data:"],
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      cssTarget: ['chrome111', 'edge111', 'firefox128', 'safari16.4', 'ios16.4'],
    },
  },
});