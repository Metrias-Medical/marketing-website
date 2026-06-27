// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://www.metriasmedical.com',
  output: 'static',
  redirects: {
    // Offline / QR entry stubs — Pattern A of the "Redirect & Short-Link Conventions" spec.
    // Apex-safe static 301s; new slugs use slug === utm_source. Never mint bare apex paths.
    // Business-card QR → the founder persona page (built 2026-06-06). UTM tags the offline source.
    '/connect/mene': '/mene?utm_source=card&utm_medium=offline&utm_campaign=biz-card-2026',
    // Email-signature link → founder page (MMDEV-332 cleanup 2026-06-26).
    '/connect/email-sig': '/mene?utm_source=email-sig&utm_medium=email&utm_campaign=evergreen',
    // Printed one-pager / leave-behind → hospitals (ICP buyer) page (MMDEV-332 cleanup 2026-06-26).
    '/connect/onepager': '/hospitals?utm_source=onepager&utm_medium=offline&utm_campaign=evergreen',
    // Funding/dilution model taken down 2026-06-06 (to be replaced with valuation indicators).
    // Old model URLs land on /investors instead of 404ing.
    '/model': '/investors',
    '/investors/model': '/investors',
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
