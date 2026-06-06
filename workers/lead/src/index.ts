/**
 * metrias-lead — Cloudflare Worker for metriasmedical.com lead capture.
 *
 * Implements the "Lead Capture → Attio Wiring" spec (Notion, MM.com Hub):
 *   POST /api/lead       validate → anti-spam → upsert Attio Person + Note → PostHog event → notify
 *   GET  /api/lead       issue a CSRF token (stateless, HMAC-signed)
 *
 * Hard rule: this endpoint collects NO PHI. See validation below.
 */

export interface Env {
  LEADS_KV: KVNamespace;
  ATTIO_API_TOKEN: string;
  POSTHOG_API_KEY: string;
  POSTHOG_HOST: string;
  CSRF_SECRET: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT_PER_HOUR: string;
  NOTIFY_WEBHOOK_URL?: string;
}

const ATTIO_BASE = 'https://api.attio.com/v2';
const CSRF_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Small disposable-email blocklist (extend as needed).
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
  'trashmail.com', 'getnada.com', 'sharklasers.com', 'maildrop.cc', 'dispostable.com',
]);

interface LeadPayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  role?: string;
  company?: string;
  message?: string;
  _honeypot?: string;
  _csrf_token?: string;
  _source_slug?: string;
  _utm_source?: string;
  _utm_medium?: string;
  _utm_campaign?: string;
  _referrer?: string;
}

// ---------- crypto helpers ----------

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return bufToHex(sig);
}

async function sha256(msg: string): Promise<string> {
  return bufToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg)));
}

async function issueCsrf(env: Env): Promise<string> {
  const ts = Date.now().toString();
  const sig = await hmac(env.CSRF_SECRET, ts);
  return `${ts}.${sig}`;
}

async function verifyCsrf(env: Env, token: string | undefined): Promise<boolean> {
  if (!token || !token.includes('.')) return false;
  const [ts, sig] = token.split('.');
  const ageOk = Number.isFinite(+ts) && Date.now() - +ts < CSRF_TTL_MS && +ts <= Date.now();
  if (!ageOk) return false;
  const expected = await hmac(env.CSRF_SECRET, ts);
  // constant-time-ish compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ---------- validation ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Defensive PHI guard: reject obvious patient-data markers in free text.
const PHI_MARKERS = /\b(mrn|medical record (number|no)|date of birth|\bdob\b|ssn|social security|patient name|diagnosis code|icd-?10)\b/i;

function clean(s: unknown, max: number): string {
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
}

interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  data: {
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    company: string;
    message: string;
  };
}

function validate(p: LeadPayload): ValidationResult {
  const data = {
    first_name: clean(p.first_name, 50),
    last_name: clean(p.last_name, 50),
    email: clean(p.email, 254).toLowerCase(),
    role: clean(p.role, 100),
    company: clean(p.company, 100),
    message: clean(p.message, 2000),
  };
  const errors: Record<string, string> = {};
  if (!data.first_name) errors.first_name = 'First name is required.';
  if (!data.last_name) errors.last_name = 'Last name is required.';
  if (!data.email) errors.email = 'Email is required.';
  else if (!EMAIL_RE.test(data.email)) errors.email = 'Enter a valid email address.';
  else if (DISPOSABLE_DOMAINS.has(data.email.split('@')[1])) errors.email = 'Please use a work email address.';
  if (PHI_MARKERS.test(data.message)) {
    errors.message = 'Please do not include patient information. This form is not for PHI.';
  }
  return { ok: Object.keys(errors).length === 0, errors, data };
}

/** Best-effort MX/A check via Cloudflare DoH, cached 24h. Non-fatal on lookup failure. */
async function domainHasMail(env: Env, email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;
  const cacheKey = `mx:${domain}`;
  const cached = await env.LEADS_KV.get(cacheKey);
  if (cached !== null) return cached === '1';
  try {
    const lookup = async (type: 'MX' | 'A') => {
      const r = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
      });
      const j: any = await r.json();
      return Array.isArray(j.Answer) && j.Answer.length > 0;
    };
    const valid = (await lookup('MX')) || (await lookup('A'));
    await env.LEADS_KV.put(cacheKey, valid ? '1' : '0', { expirationTtl: 86400 });
    return valid;
  } catch {
    return true; // do not block on resolver hiccup
  }
}

// ---------- Attio ----------

async function attioFetch(env: Env, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${ATTIO_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.ATTIO_API_TOKEN}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function findOrCreateCompany(env: Env, name: string): Promise<string | null> {
  if (!name) return null;
  try {
    const r = await attioFetch(env, '/objects/companies/records?matching_attribute=name', {
      method: 'PUT',
      body: JSON.stringify({ data: { values: { name: [{ value: name }] } } }),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    return j?.data?.id?.record_id ?? null;
  } catch {
    return null;
  }
}

/** Upsert the person by email. Returns the Attio record id. Throws on hard failure. */
async function upsertPerson(env: Env, d: ValidationResult['data'], companyId: string | null): Promise<string> {
  const values: Record<string, unknown> = {
    name: [{ first_name: d.first_name, last_name: d.last_name, full_name: `${d.first_name} ${d.last_name}`.trim() }],
    email_addresses: [{ email_address: d.email }],
  };
  if (d.role) values.job_title = [{ value: d.role }];
  if (companyId) values.company = [{ target_object: 'companies', target_record_id: companyId }];

  const r = await attioFetch(env, '/objects/people/records?matching_attribute=email_addresses', {
    method: 'PUT',
    body: JSON.stringify({ data: { values } }),
  });
  if (!r.ok) throw new Error(`attio person upsert failed: ${r.status} ${await r.text()}`);
  const j: any = await r.json();
  const id = j?.data?.id?.record_id;
  if (!id) throw new Error('attio person upsert: no record_id in response');
  return id;
}

async function createNote(env: Env, personId: string, d: ValidationResult['data'], meta: LeadPayload): Promise<void> {
  const lines = [
    `New website lead (auto_logged: true)`,
    d.company ? `Company: ${d.company}` : null,
    d.role ? `Role: ${d.role}` : null,
    d.message ? `\nMessage:\n${d.message}` : null,
    `\nSource: ${meta._source_slug || 'website'}`,
    `Landing page: ${meta._referrer || 'n/a'}`,
    `Attribution: utm_source=${meta._utm_source || '-'} utm_medium=${meta._utm_medium || '-'} utm_campaign=${meta._utm_campaign || '-'}`,
  ].filter(Boolean);
  await attioFetch(env, '/notes', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        parent_object: 'people',
        parent_record_id: personId,
        title: `Website inquiry — ${d.first_name} ${d.last_name}`,
        format: 'plaintext',
        content: lines.join('\n'),
      },
    }),
  });
}

// ---------- PostHog ----------

async function posthogCapture(env: Env, distinctId: string, props: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${env.POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: env.POSTHOG_API_KEY,
        event: 'lead_captured',
        distinct_id: distinctId,
        properties: props,
      }),
    });
  } catch {
    /* analytics gap acceptable */
  }
}

async function notify(env: Env, d: ValidationResult['data']): Promise<void> {
  if (!env.NOTIFY_WEBHOOK_URL) return;
  try {
    await fetch(env.NOTIFY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `New lead: ${d.first_name} ${d.last_name}${d.company ? ` from ${d.company}` : ''} (${d.email})`,
      }),
    });
  } catch {
    /* fire-and-forget */
  }
}

// ---------- HTTP plumbing ----------

function corsHeaders(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(env) },
  });
}

async function handleLead(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let payload: LeadPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON.' }, 400, env);
  }

  // 1) Honeypot — silently accept (do not signal to the bot).
  if (clean(payload._honeypot, 200)) return json({ ok: true }, 200, env);

  // 2) CSRF
  if (!(await verifyCsrf(env, payload._csrf_token))) {
    return json({ ok: false, error: 'Invalid or expired form token. Reload and try again.' }, 403, env);
  }

  // 3) Rate limit per IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `rl:${ip}`;
  const limit = parseInt(env.RATE_LIMIT_PER_HOUR || '5', 10);
  const count = parseInt((await env.LEADS_KV.get(rlKey)) || '0', 10);
  if (count >= limit) {
    return json({ ok: false, error: 'Too many submissions. Please try again later.' }, 429, env);
  }

  // 4) Validate
  const v = validate(payload);
  if (!v.ok) return json({ ok: false, errors: v.errors }, 400, env);

  // 5) MX/A sanity (best-effort)
  if (!(await domainHasMail(env, v.data.email))) {
    return json({ ok: false, errors: { email: 'That email domain does not appear to receive mail.' } }, 400, env);
  }

  // Count this attempt against the rate limit now that it is well-formed.
  await env.LEADS_KV.put(rlKey, String(count + 1), { expirationTtl: 3600 });

  const distinctId = await sha256(v.data.email);
  const phProps = {
    page: payload._referrer || null,
    source_slug: payload._source_slug || 'website',
    utm_source: payload._utm_source || null,
    utm_medium: payload._utm_medium || null,
    utm_campaign: payload._utm_campaign || null,
    company: v.data.company || null,
  };

  // 6) Write to Attio. On outage, queue to KV and still return success.
  try {
    const companyId = await findOrCreateCompany(env, v.data.company);
    const personId = await upsertPerson(env, v.data, companyId);
    ctx.waitUntil(createNote(env, personId, v.data, payload));
  } catch (err) {
    await env.LEADS_KV.put(`queue:${Date.now()}:${distinctId}`, JSON.stringify({ data: v.data, meta: payload }), {
      expirationTtl: 7 * 86400,
    });
  }

  // 7) Analytics + notification (non-blocking)
  ctx.waitUntil(posthogCapture(env, distinctId, phProps));
  ctx.waitUntil(notify(env, v.data));

  return json({ ok: true }, 200, env);
}

/** Replay Attio-queued leads (cron). Best-effort; deletes on success. */
async function replayQueue(env: Env): Promise<void> {
  const list = await env.LEADS_KV.list({ prefix: 'queue:' });
  for (const key of list.keys) {
    const raw = await env.LEADS_KV.get(key.name);
    if (!raw) continue;
    try {
      const { data, meta } = JSON.parse(raw) as { data: ValidationResult['data']; meta: LeadPayload };
      const companyId = await findOrCreateCompany(env, data.company);
      const personId = await upsertPerson(env, data, companyId);
      await createNote(env, personId, data, meta);
      await env.LEADS_KV.delete(key.name);
    } catch {
      /* leave queued for next run */
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
    if (!url.pathname.replace(/\/$/, '').endsWith('/api/lead') && url.pathname !== '/api/lead') {
      return json({ ok: false, error: 'Not found.' }, 404, env);
    }
    if (request.method === 'GET') return json({ csrf_token: await issueCsrf(env) }, 200, env);
    if (request.method === 'POST') return handleLead(request, env, ctx);
    return json({ ok: false, error: 'Method not allowed.' }, 405, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(replayQueue(env));
  },
};
