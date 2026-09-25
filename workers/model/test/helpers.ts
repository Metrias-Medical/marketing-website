import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env as bindings } from 'cloudflare:workers';
import { vi } from 'vitest';
import { randomHex } from '../../lib/crypto';
import worker, { type Env } from '../src/index';

export const ORIGIN = 'https://model.metriasmedical.com';

// Random per run: no credential-shaped literal lives in the repo.
export const SECRETS = {
  CSRF_SECRET: randomHex(32),
  SESSION_SECRET: randomHex(32),
  ADMIN_TOKEN: randomHex(32),
  ATTIO_API_TOKEN: randomHex(16),
  POSTHOG_API_KEY: randomHex(16),
  RESEND_API_KEY: randomHex(16),
};

// ---------- in-memory ASSETS, shaped like the page build output ----------

export const FILES: Record<string, { body: string; type: string }> = {
  '/index.html': { body: '<!doctype html><title>Model</title><main>GATED_MODEL_CONTENT</main>', type: 'text/html' },
  '/request.html': { body: '<!doctype html><title>Request access</title><form>REQUEST_FORM</form>', type: 'text/html' },
  '/_astro/request.abc123.css': { body: 'body{font-family:Inter}', type: 'text/css' },
  '/_astro/RequestAccessForm.abc123.js': { body: 'export default 1;', type: 'text/javascript' },
  '/_model/FundingModel.def456.js': { body: 'export const GATED_BUNDLE = 1;', type: 'text/javascript' },
  '/fonts/inter.woff2': { body: 'font', type: 'font/woff2' },
  '/favicon.svg': { body: '<svg/>', type: 'image/svg+xml' },
  '/favicon.ico': { body: 'ico', type: 'image/x-icon' },
  '/images/brand/metrias-logo-static-v1.png': { body: 'png', type: 'image/png' },
  '/images/brand/other.png': { body: 'png', type: 'image/png' },
};

/** Mimics Workers Static Assets with html_handling auto-trailing-slash for the two pages. */
export const fakeAssets = {
  async fetch(input: RequestInfo | URL): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    let path = url.pathname;
    if (path === '/request.html') return new Response(null, { status: 307, headers: { location: '/request' } });
    if (path === '/index.html') return new Response(null, { status: 307, headers: { location: '/' } });
    if (path === '/') path = '/index.html';
    if (path === '/request') path = '/request.html';
    const f = FILES[path];
    if (!f) return new Response('Not found', { status: 404 });
    return new Response(f.body, { status: 200, headers: { 'content-type': f.type, 'cache-control': 'public, max-age=0' } });
  },
} as unknown as Fetcher;

export function makeEnv(overrides: Partial<Env> = {}): Env {
  const base = bindings as unknown as Env;
  return {
    MODEL_KV: base.MODEL_KV,
    ASSETS: fakeAssets,
    POSTHOG_HOST: 'https://us.i.posthog.com',
    ALLOWED_ORIGIN: ORIGIN,
    EMAIL_FROM: 'access@metriasmedical.com',
    EMAIL_TRANSPORT: 'resend',
    LINK_TTL_SECONDS: '900',
    SESSION_TTL_SECONDS: '2592000',
    ...SECRETS,
    ...overrides,
  };
}

export async function call(req: Request, env: Env = makeEnv()): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

export async function clearKv(env: Env = makeEnv()): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await env.MODEL_KV.list({ cursor });
    await Promise.all(page.keys.map((k) => env.MODEL_KV.delete(k.name)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

// ---------- outbound fetch mock (Attio, PostHog, Resend, DoH) ----------

export interface Recorded {
  url: string;
  method: string;
  body: any;
  headers: Record<string, string>;
}

export interface MockOptions {
  /** 'ok' | 'missing_list' | 'error' */
  list?: 'ok' | 'missing_list' | 'error';
  /** Entry attribute slugs Attio should report as unknown. */
  missingEntryAttributes?: string[];
  /** Person attribute slugs Attio should report as unknown. */
  missingPersonAttributes?: string[];
  /** Domains the DoH stub reports as having no MX or A record. */
  noMailDomains?: string[];
  resendStatus?: number;
}

export function mockFetch(opts: MockOptions = {}) {
  const calls: Recorded[] = [];
  const unknownAttr = (slug: string) =>
    new Response(
      JSON.stringify({ status_code: 400, type: 'invalid_request_error', code: 'value_not_found', message: `Cannot find attribute with slug/ID "${slug}".` }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as RequestInfo, init);
    const url = req.url;
    const text = req.method === 'GET' ? '' : await req.text();
    let body: any = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => (headers[k] = v));
    calls.push({ url, method: req.method, body, headers });

    if (url.startsWith('https://1.1.1.1/dns-query')) {
      const name = new URL(url).searchParams.get('name') || '';
      const has = !(opts.noMailDomains || []).includes(name);
      return ok(has ? { Answer: [{ name, type: 15, data: `10 mx.${name}.` }] } : { Status: 3 });
    }
    if (url.startsWith('https://api.resend.com/emails')) {
      const status = opts.resendStatus ?? 200;
      return new Response(JSON.stringify(status === 200 ? { id: 'email_1' } : { message: 'error' }), { status });
    }
    if (url.startsWith('https://us.i.posthog.com/capture/')) return ok({ status: 1 });

    if (url.startsWith('https://api.attio.com/v2/')) {
      const path = url.slice('https://api.attio.com/v2'.length);
      if (path.startsWith('/objects/companies/records/query')) return ok({ data: [] });
      if (path.startsWith('/objects/companies/records')) return ok({ data: { id: { record_id: 'company_rec_1' } } });
      if (path.startsWith('/objects/people/records')) {
        for (const slug of opts.missingPersonAttributes || []) if (body?.data?.values?.[slug]) return unknownAttr(slug);
        return ok({ data: { id: { record_id: 'person_rec_1' } } });
      }
      if (path.startsWith('/lists/model_access/entries')) {
        if (opts.list === 'missing_list') return new Response(JSON.stringify({ status_code: 404, code: 'not_found', message: 'List not found.' }), { status: 404 });
        if (opts.list === 'error') return new Response('upstream', { status: 500 });
        for (const slug of opts.missingEntryAttributes || []) if (body?.data?.entry_values?.[slug] !== undefined) return unknownAttr(slug);
        return ok({ data: { id: { entry_id: 'entry_1' } } });
      }
      return new Response('not mocked', { status: 404 });
    }
    return new Response('unexpected outbound fetch in test', { status: 599 });
  });

  return {
    spy,
    calls,
    resend: () => calls.filter((c) => c.url.startsWith('https://api.resend.com/')),
    posthog: (event?: string) =>
      calls.filter((c) => c.url.startsWith('https://us.i.posthog.com/') && (!event || c.body?.event === event)),
    listEntries: () => calls.filter((c) => c.url.includes('/lists/model_access/entries')),
    people: () => calls.filter((c) => c.url.includes('/objects/people/records')),
    attio: () => calls.filter((c) => c.url.startsWith('https://api.attio.com/')),
  };
}

// ---------- request helpers ----------

export async function csrfToken(env: Env = makeEnv()): Promise<string> {
  const r = await call(new Request(`${ORIGIN}/api/request`), env);
  return ((await r.json()) as { csrf_token: string }).csrf_token;
}

export function requestBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@capital.example',
    organization: 'Example Capital',
    role: 'Partner',
    persona: 'Investor',
    linkedin: 'https://www.linkedin.com/in/example',
    consent: true,
    _honeypot: '',
    _source_slug: 'model_gate',
    _utm_source: 'linkedin',
    _utm_medium: 'social',
    _utm_campaign: 'seed',
    _utm_content: '',
    _referrer: '/',
    _ext_referrer: 'https://www.linkedin.com/',
    ...overrides,
  };
}

export async function postRequest(
  body: Record<string, unknown>,
  { ip = '203.0.113.10', env = makeEnv(), csrf }: { ip?: string; env?: Env; csrf?: string | null } = {},
): Promise<Response> {
  const token = csrf === undefined ? await csrfToken(env) : csrf;
  return call(
    new Request(`${ORIGIN}/api/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ ...body, ...(token === null ? {} : { _csrf_token: token }) }),
    }),
    env,
  );
}

export function linkFromEmail(recorded: Recorded): string {
  const m = /\/auth\?t=([0-9a-f]+\.[0-9a-f]+)/.exec(recorded.body.text);
  if (!m) throw new Error('no link in email');
  return m[1];
}

export async function auth(token: string, env: Env = makeEnv()): Promise<Response> {
  return call(new Request(`${ORIGIN}/auth?t=${token}`, { redirect: 'manual' }), env);
}

export function cookieFrom(res: Response): string {
  const sc = res.headers.get('set-cookie') || '';
  return sc.split(';')[0];
}

/** Request a link, click it, and return the session cookie pair ("name=value"). */
export async function signIn(
  mock: ReturnType<typeof mockFetch>,
  overrides: Record<string, unknown> = {},
  ip = '203.0.113.20',
): Promise<string> {
  const before = mock.resend().length;
  const r = await postRequest(requestBody(overrides), { ip });
  if (r.status !== 200) throw new Error(`request failed ${r.status}`);
  const sent = mock.resend();
  if (sent.length !== before + 1) throw new Error('no email sent');
  const res = await auth(linkFromEmail(sent[sent.length - 1]));
  return cookieFrom(res);
}

export function get(path: string, cookie?: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { headers: { ...(cookie ? { cookie } : {}), ...headers }, redirect: 'manual' });
}
