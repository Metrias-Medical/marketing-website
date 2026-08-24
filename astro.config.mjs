// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://www.metriasmedical.com',
  output: 'static',
  redirects: {
    // Offline / QR entry stubs — Pattern A of the "Redirect & Short-Link Conventions" spec.
    // Apex-safe static stubs; new slugs use slug === utm_source. Never mint bare apex paths.
    // (These emit an Astro meta-refresh page, not a server 301 — GitHub Pages can't issue one.)
    // Business-card QR → the founder persona page (built 2026-06-06). UTM tags the offline source.
    '/connect/mene': '/mene?utm_source=card&utm_medium=offline&utm_campaign=biz-card-2026',
    // Email-signature link → founder page (MMDEV-332 cleanup 2026-06-26).
    '/connect/email-sig': '/mene?utm_source=email-sig&utm_medium=email&utm_campaign=evergreen',
    // Printed one-pager / leave-behind → hospitals (ICP buyer) page (MMDEV-332 cleanup 2026-06-26).
    '/connect/onepager': '/hospitals?utm_source=onepager&utm_medium=offline&utm_campaign=evergreen',
    // 30-minute booking short-link (2026-08-12). DEVIATES from slug === utm_source on purpose:
    // this slug names a DESTINATION, not a source, because one link is reused across email sig,
    // LinkedIn DMs, and verbal hand-off. Trade-off accepted: the visitor leaves the estate
    // immediately, so PostHog / Insight Tag / Attio see nothing — the calendar invite is the only
    // record. Use the on-page CTAs (which keep attribution) wherever a page is already in play.
    '/connect/30min': 'https://calendar.app.google/KQK1bpNdcZxSffkDA',
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
