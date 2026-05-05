// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://www.metriasmedical.com',
  output: 'static',
  redirects: {
    // QR code target (e.g. business card). Swap destination as needed.
    '/connect/mene': '/about',
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
