/**
 * Shared browser-side plumbing for every form that posts to the lead Worker (workers/lead):
 * the site-wide LeadFormModal and the /updates sign-up form. Keeps the Worker's payload contract
 * (`_source_slug`, `_utm_*`, `_referrer`, `_ext_referrer`) defined in one place.
 */

// Dedicated proxied Worker subdomain (Path B). Same-origin /api/lead won't work because the
// GitHub Pages records are DNS-only; the Worker lives on lead.metriasmedical.com (CORS allows www).
export const LEAD_ENDPOINT = 'https://lead.metriasmedical.com/api/lead';
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// First-touch attribution. UTM params live on the LANDING url, but this is an Astro MPA — query
// params vanish once a visitor navigates to another page before opening the form. So we persist the
// first-seen UTM set to sessionStorage on first load and reuse it at submit time. This is what
// stamps the acquisition channel onto the Attio lead + PostHog conversion (MMDEV-221 / MMDEV-223).
const ATTRIB_KEY = 'mm_first_touch';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

export function captureFirstTouch() {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(ATTRIB_KEY)) return; // first touch wins
    const q = new URLSearchParams(window.location.search);
    const hasUtm = UTM_KEYS.some((k) => q.get(k));
    const referrer = document.referrer || '';
    // Only lock in a first-touch when there's a real signal (a UTM or an external referrer), so a
    // plain direct visit doesn't pin an empty record and mask a later UTM'd entry in the same tab.
    if (!hasUtm && !referrer) return;
    sessionStorage.setItem(
      ATTRIB_KEY,
      JSON.stringify({
        utm_source: q.get('utm_source') || '',
        utm_medium: q.get('utm_medium') || '',
        utm_campaign: q.get('utm_campaign') || '',
        utm_content: q.get('utm_content') || '',
        landing_path: window.location.pathname,
        referrer,
      }),
    );
  } catch {
    /* sessionStorage blocked (private mode) — fall back to the live URL at submit time */
  }
}

export function getAttribution() {
  if (typeof window === 'undefined') return {};
  let ft: Record<string, string> = {};
  try {
    ft = JSON.parse(sessionStorage.getItem(ATTRIB_KEY) || '{}');
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams(window.location.search);
  const pick = (k: string) => ft[k] || q.get(k) || '';
  return {
    _utm_source: pick('utm_source'),
    _utm_medium: pick('utm_medium'),
    _utm_campaign: pick('utm_campaign'),
    _utm_content: pick('utm_content'),
    _referrer: window.location.pathname,
    _ext_referrer: ft.referrer || (typeof document !== 'undefined' ? document.referrer : ''),
  };
}
