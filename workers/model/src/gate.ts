/**
 * Static asset gate.
 *
 * The page build emits request.html and index.html at the assets root, public-safe JS and CSS
 * under _astro/, and the gated page's JS under _model/. Without a session only the request form
 * and its dependencies (PUBLIC_EXACT, PUBLIC_PREFIXES) are served. Everything else, including
 * index.html and _model/, needs a valid session cookie.
 */

import type { Env } from './env';

export const GATED_HEADERS: Record<string, string> = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
};

const PUBLIC_HEADERS: Record<string, string> = {
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
};

export const REQUEST_PAGE = '/request.html';

/**
 * `/request` is included because Workers Static Assets html_handling redirects /request.html to
 * /request by default; both are the same document.
 */
export const PUBLIC_EXACT = new Set([
  '/request.html',
  '/request',
  '/favicon.svg',
  '/favicon.ico',
  '/images/brand/metrias-logo-static-v1.png',
]);
export const PUBLIC_PREFIXES = ['/_astro/', '/fonts/'];

export function isPublicAsset(path: string): boolean {
  if (path.includes('..')) return false;
  return PUBLIC_EXACT.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

/** A browser navigation (document request) rather than a fetch or subresource. */
export function isNavigation(request: Request): boolean {
  return (request.headers.get('accept') || '').includes('text/html');
}

export function withHeaders(res: Response, headers: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

/** Fetch an asset by path through the ASSETS binding, following internal redirects. */
export async function fetchAsset(env: Env, origin: string, path: string, hops = 3): Promise<Response> {
  let url = new URL(path, origin);
  for (let i = 0; i <= hops; i++) {
    const res = await env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }));
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url);
      continue;
    }
    return res;
  }
  return new Response('Too many redirects', { status: 508 });
}

/** The request form, served in place at / for visitors without a session. */
export async function serveRequestForm(env: Env, request: Request): Promise<Response> {
  const res = await fetchAsset(env, new URL(request.url).origin, REQUEST_PAGE);
  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Request form is not built.' }), {
      status: 503,
      headers: { 'content-type': 'application/json', ...GATED_HEADERS },
    });
  }
  const out = withHeaders(res, GATED_HEADERS);
  if (request.method === 'HEAD') return new Response(null, { status: out.status, headers: out.headers });
  return out;
}

export async function servePublicAsset(env: Env, request: Request): Promise<Response> {
  return withHeaders(await env.ASSETS.fetch(request), PUBLIC_HEADERS);
}

export async function serveGatedAsset(env: Env, request: Request): Promise<Response> {
  return withHeaders(await env.ASSETS.fetch(request), GATED_HEADERS);
}
