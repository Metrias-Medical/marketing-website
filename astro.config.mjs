// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://www.metriasmedical.com',
  output: 'static',
  redirects: {
    // Business-card QR → the founder persona page (built 2026-06-06). UTM tags the offline source.
    '/connect/mene': '/mene?utm_source=card&utm_medium=offline&utm_campaign=biz-card-2026',
    // Funding/dilution model relocated off the apex (off-thesis for the primary
    // hospital-COO visitor); now lives under /investors. See Conversion & Credibility Audit 2026-05-28.
    '/model': '/investors/model',
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
