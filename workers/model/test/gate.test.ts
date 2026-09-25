import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPublicAsset } from '../src/gate';
import { call, clearKv, get, mockFetch, signIn } from './helpers';

beforeEach(async () => {
  await clearKv();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const HTML = { accept: 'text/html,application/xhtml+xml' };

function expectGatedHeaders(res: Response) {
  expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
}

describe('gate without a session', () => {
  it('serves the request form in place at /', async () => {
    mockFetch();
    const res = await call(get('/', undefined, HTML));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('REQUEST_FORM');
    expect(body).not.toContain('GATED_MODEL_CONTENT');
    expectGatedHeaders(res);
  });

  it('serves the allowlisted request-page dependencies as-is', async () => {
    mockFetch();
    for (const path of [
      '/request',
      '/_astro/request.abc123.css',
      '/_astro/RequestAccessForm.abc123.js',
      '/fonts/inter.woff2',
      '/favicon.svg',
      '/favicon.ico',
      '/images/brand/metrias-logo-static-v1.png',
    ]) {
      const res = await call(get(path));
      expect(res.status, path).toBe(200);
      expect(res.headers.get('x-robots-tag'), path).toBe('noindex, nofollow');
    }
    // /request.html is passed through as-is; static assets html_handling redirects it to /request.
    const req = await call(get('/request.html'));
    expect(req.status).toBe(307);
    expect(req.headers.get('location')).toBe('/request');
  });

  it('blocks the gated page and its _model bundles with 401 JSON for fetches', async () => {
    mockFetch();
    for (const path of ['/index.html', '/_model/FundingModel.def456.js', '/_model/anything.css', '/images/brand/other.png', '/secret']) {
      const res = await call(get(path));
      expect(res.status, path).toBe(401);
      expect(res.headers.get('content-type'), path).toBe('application/json');
      const text = await res.text();
      expect(text).not.toContain('GATED');
    }
  });

  it('redirects navigations to gated paths to /request.html', async () => {
    mockFetch();
    for (const path of ['/index.html', '/_model/FundingModel.def456.js', '/anything']) {
      const res = await call(get(path, undefined, HTML));
      expect(res.status, path).toBe(302);
      expect(res.headers.get('location'), path).toBe('/request.html');
    }
  });

  it('rejects a forged cookie', async () => {
    mockFetch();
    const forged = `mm_model_session=${'a'.repeat(64)}.${Date.now()}.${'b'.repeat(64)}`;
    expect((await call(get('/_model/FundingModel.def456.js', forged))).status).toBe(401);
    expect(await (await call(get('/', forged))).text()).toContain('REQUEST_FORM');
  });

  it('allowlist helper refuses traversal and near misses', () => {
    expect(isPublicAsset('/_astro/x.js')).toBe(true);
    expect(isPublicAsset('/_model/x.js')).toBe(false);
    expect(isPublicAsset('/_astro/../_model/x.js')).toBe(false);
    expect(isPublicAsset('/_astrox/y.js')).toBe(false);
    expect(isPublicAsset('/index.html')).toBe(false);
    expect(isPublicAsset('/')).toBe(false);
  });

  it('refuses non-GET methods on assets', async () => {
    mockFetch();
    const res = await call(new Request('https://model.metriasmedical.com/index.html', { method: 'POST' }));
    expect(res.status).toBe(405);
  });
});

describe('gate with a session', () => {
  it('serves the model at / and gated bundles, with private headers', async () => {
    const mock = mockFetch();
    const cookie = await signIn(mock);

    const index = await call(get('/', cookie, HTML));
    expect(index.status).toBe(200);
    expect(await index.text()).toContain('GATED_MODEL_CONTENT');
    expectGatedHeaders(index);

    const bundle = await call(get('/_model/FundingModel.def456.js', cookie));
    expect(bundle.status).toBe(200);
    expect(await bundle.text()).toContain('GATED_BUNDLE');
    expectGatedHeaders(bundle);

    const form = await call(get('/request', cookie));
    expect(form.status).toBe(200);
  });

  it('passes through asset 404s for unknown paths', async () => {
    const mock = mockFetch();
    const cookie = await signIn(mock);
    const res = await call(get('/nope.js', cookie));
    expect(res.status).toBe(404);
    expectGatedHeaders(res);
  });
});

describe('API routing', () => {
  it('returns 404 JSON for unknown API paths and 405 for wrong methods', async () => {
    mockFetch();
    expect((await call(get('/api/unknown'))).status).toBe(404);
    expect((await call(new Request('https://model.metriasmedical.com/me', { method: 'POST' }))).status).toBe(405);
    expect((await call(get('/api/revoke'))).status).toBe(405);
    expect((await call(get('/api/engagement'))).status).toBe(405);
    expect((await call(new Request('https://model.metriasmedical.com/auth', { method: 'POST' }))).status).toBe(405);
  });
});
