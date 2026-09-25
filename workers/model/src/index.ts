/**
 * metrias-model: gates model.metriasmedical.com behind an email magic link.
 *
 * HTTP surface (docs/model-gate/CONTRACT.md):
 *   GET  /api/request     CSRF token
 *   POST /api/request     validate, rate-limit, Attio upsert, KV nonce, send magic link
 *   GET  /auth?t=...      single-use link, sets the session cookie, 302 to /
 *   GET  /me              viewer identity for client telemetry
 *   POST /api/engagement  engagement summary from the page (sendBeacon friendly)
 *   POST /api/revoke      admin revocation
 *   GET  /*               gated static assets (request form at / without a session)
 *
 * Hard rule: this Worker collects no PHI. Free-text fields go through the PHI guard.
 */

import { constantTimeEqual, emailHash, issueCsrf, sha256, verifyCsrf } from '../../lib/crypto';
import { corsHeaders, json, readJsonBody } from '../../lib/http';
import { posthogCapture, posthogSetPerson, type PostHogConfig } from '../../lib/posthog';
import {
  clean,
  containsPhi,
  domainHasMail,
  emailDomain,
  isDisposableEmail,
  isValidEmail,
  PHI_ERROR,
} from '../../lib/validation';
import { ensurePersonId, entryValues, upsertModelAccess } from './crm';
import { createTransport, magicLinkEmail } from './email';
import {
  ENGAGED_SECONDS,
  IP_LIMIT_PER_HOUR,
  LINKS_PER_EMAIL_PER_DAY,
  linkTtlSeconds,
  PERSONAS,
  sessionTtlSeconds,
  type Env,
} from './env';
import {
  GATED_HEADERS,
  isNavigation,
  isPublicAsset,
  REQUEST_PAGE,
  serveGatedAsset,
  servePublicAsset,
  serveRequestForm,
} from './gate';
import {
  advanceStage,
  getPerson,
  hitLimit,
  peekLimit,
  putPerson,
  TOMBSTONE_TTL,
  utcDay,
  type LinkRecord,
  type PersonSummary,
} from './store';
import { getSession, issueLinkToken, isRevoked, sessionCookieHeader, signSession, verifyLinkToken } from './tokens';

export type { Env } from './env';

// ---------- helpers ----------

/** Upper bound on engaged seconds accepted from a single beacon. */
const MAX_BEACON_SECONDS = 600;

function api(env: Env, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return json(body, status, { ...corsHeaders(env.ALLOWED_ORIGIN), ...GATED_HEADERS, ...extra });
}

function ph(env: Env): PostHogConfig {
  return { host: env.POSTHOG_HOST, apiKey: env.POSTHOG_API_KEY };
}

function redirect(location: string, extra: Record<string, string> = {}): Response {
  return new Response(null, { status: 302, headers: { location, ...GATED_HEADERS, ...extra } });
}

function isoNow(now = Date.now()): string {
  return new Date(now).toISOString();
}

/** Re-read the summary and store the Attio id on it, so concurrent writers do not lose it. */
async function persistAttioId(env: Env, hash: string, id: string | null): Promise<void> {
  if (!id) return;
  const p = await getPerson(env, hash);
  if (p && p.attio_person_id !== id) {
    p.attio_person_id = id;
    await putPerson(env, hash, p);
  }
}

async function attioStamp(env: Env, hash: string, p: PersonSummary, fields: Parameters<typeof entryValues>[1]): Promise<void> {
  try {
    const hadId = !!p.attio_person_id;
    const id = await ensurePersonId(env, p);
    if (!hadId) await persistAttioId(env, hash, id);
    await upsertModelAccess(env, id, entryValues(p, fields));
  } catch (err) {
    console.warn(`[attio] stamp failed: ${(err as Error).message}`);
  }
}

// ---------- validation ----------

export interface RequestPayload {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  organization?: unknown;
  role?: unknown;
  persona?: unknown;
  linkedin?: unknown;
  consent?: unknown;
  _honeypot?: unknown;
  _csrf_token?: unknown;
  _source_slug?: unknown;
  _utm_source?: unknown;
  _utm_medium?: unknown;
  _utm_campaign?: unknown;
  _utm_content?: unknown;
  _referrer?: unknown;
  _ext_referrer?: unknown;
}

export interface ValidRequest {
  first_name: string;
  last_name: string;
  email: string;
  organization: string;
  role: string;
  persona: string;
  linkedin: string;
}

const LINKEDIN_RE = /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/\S+$/i;

export function validateRequest(p: RequestPayload): { ok: boolean; errors: Record<string, string>; data: ValidRequest } {
  const data: ValidRequest = {
    first_name: clean(p.first_name, 50),
    last_name: clean(p.last_name, 50),
    email: clean(p.email, 254).toLowerCase(),
    organization: clean(p.organization, 120),
    role: clean(p.role, 100),
    persona: clean(p.persona, 40),
    linkedin: clean(p.linkedin, 200),
  };
  const errors: Record<string, string> = {};
  if (!data.first_name) errors.first_name = 'First name is required.';
  if (!data.last_name) errors.last_name = 'Last name is required.';
  if (!data.email) errors.email = 'Email is required.';
  else if (!isValidEmail(data.email)) errors.email = 'Enter a valid email address.';
  else if (isDisposableEmail(data.email)) errors.email = 'Please use a work email address.';
  if (!data.organization) errors.organization = 'Organization is required.';
  if (!data.role) errors.role = 'Role is required.';
  const persona = PERSONAS.find((x) => x.toLowerCase() === data.persona.toLowerCase());
  if (!persona) errors.persona = 'Choose the option that best describes you.';
  else data.persona = persona;
  if (data.linkedin && !LINKEDIN_RE.test(data.linkedin)) errors.linkedin = 'Enter a full LinkedIn profile URL.';
  if (!(p.consent === true || p.consent === 'true' || p.consent === 'on')) {
    errors.consent = 'Please confirm you want a one-time access link.';
  }
  for (const f of ['first_name', 'last_name', 'organization', 'role'] as const) {
    if (!errors[f] && containsPhi(data[f])) errors[f] = PHI_ERROR;
  }
  return { ok: Object.keys(errors).length === 0, errors, data };
}

// ---------- POST /api/request ----------

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const payload = await readJsonBody<RequestPayload>(request);
  if (!payload) return api(env, { ok: false, error: 'Invalid JSON.' }, 400);

  // 1) Honeypot: silently accept, do not signal to the bot.
  if (clean(payload._honeypot, 200)) return api(env, { ok: true });

  if (!env.CSRF_SECRET || !env.SESSION_SECRET) {
    console.error('[model] CSRF_SECRET or SESSION_SECRET is not set');
    return api(env, { ok: false, error: 'Service not configured.' }, 500);
  }

  // 2) CSRF
  if (!(await verifyCsrf(env.CSRF_SECRET, payload._csrf_token as string))) {
    return api(env, { ok: false, error: 'Invalid or expired form token. Reload and try again.' }, 403);
  }

  // 3) Rate limit per IP (5 per hour).
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipKey = `rl:ip:${ip}`;
  if (!(await peekLimit(env, ipKey, IP_LIMIT_PER_HOUR))) {
    return api(env, { ok: false, error: 'Too many requests. Please try again later.' }, 429);
  }

  // 4) Validate, then MX sanity (best effort).
  const v = validateRequest(payload);
  if (!v.ok) return api(env, { ok: false, errors: v.errors }, 400);
  if (!(await domainHasMail(env.MODEL_KV, v.data.email))) {
    return api(env, { ok: false, errors: { email: 'That email domain does not appear to receive mail.' } }, 400);
  }
  await hitLimit(env, ipKey, 3600);

  const now = Date.now();
  const hash = await emailHash(v.data.email);

  // From here on the response is always {ok:true}: no signal about the address.
  if (await isRevoked(env, hash)) {
    console.log(`[model] request from revoked viewer ${hash.slice(0, 12)}; no link sent`);
    return api(env, { ok: true });
  }

  // 5) Links per email per day (3). Over the limit: accept silently, send nothing.
  const emKey = `rl:em:${hash}`;
  if (!(await peekLimit(env, emKey, LINKS_PER_EMAIL_PER_DAY))) {
    console.log(`[model] daily link limit reached for ${hash.slice(0, 12)}; no link sent`);
    return api(env, { ok: true });
  }
  await hitLimit(env, emKey, 86400);

  // 6) Person summary.
  const prev = await getPerson(env, hash);
  const p: PersonSummary = {
    visit_count: 0,
    total_engaged_seconds: 0,
    sections_seen: [],
    request_count: 0,
    ...(prev || {}),
    email: v.data.email,
    first_name: v.data.first_name,
    last_name: v.data.last_name,
    persona: v.data.persona,
    organization: v.data.organization,
    org_domain: emailDomain(v.data.email),
    role: v.data.role,
    linkedin: v.data.linkedin || prev?.linkedin,
    stage: advanceStage(prev?.stage, 'Requested'),
    requested_at: isoNow(now),
    request_source: clean(payload._source_slug, 100) || 'model_gate',
    utm_source: clean(payload._utm_source, 200) || prev?.utm_source,
    utm_campaign: clean(payload._utm_campaign, 200) || prev?.utm_campaign,
  };
  p.request_count += 1;

  // 7) Link: one outstanding per email, re-requests rotate the nonce.
  const ttl = linkTtlSeconds(env);
  const current = await env.MODEL_KV.get(`mlcur:${hash}`);
  if (current) await env.MODEL_KV.delete(`ml:${current}`);
  const { nonce, token } = await issueLinkToken(env.SESSION_SECRET);
  const rec: LinkRecord = { email_hash: hash, issued_at: now };
  await env.MODEL_KV.put(`ml:${nonce}`, JSON.stringify(rec), { expirationTtl: ttl });
  await env.MODEL_KV.put(`mlx:${nonce}`, JSON.stringify(rec), { expirationTtl: TOMBSTONE_TTL });
  await env.MODEL_KV.put(`mlcur:${hash}`, nonce, { expirationTtl: ttl });
  await putPerson(env, hash, p);

  // 8) Send.
  const link = `${env.ALLOWED_ORIGIN.replace(/\/$/, '')}/auth?t=${token}`;
  const transport = createTransport(env);
  try {
    await transport.send(magicLinkEmail(v.data.email, v.data.first_name, link, ttl));
  } catch (err) {
    console.error(`[model] magic link send failed (${transport.name}): ${(err as Error).message}`);
  }

  // 9) CRM and analytics, off the response path.
  ctx.waitUntil(
    attioStamp(env, hash, p, ['stage', 'requested_at', 'request_source', 'utm_source', 'utm_campaign']),
  );
  ctx.waitUntil(
    posthogCapture(ph(env), 'model_access_requested', hash, {
      persona: p.persona,
      org_domain: p.org_domain,
      request_source: p.request_source,
      request_count: p.request_count,
      utm_source: clean(payload._utm_source, 200) || null,
      utm_medium: clean(payload._utm_medium, 200) || null,
      utm_campaign: clean(payload._utm_campaign, 200) || null,
      utm_content: clean(payload._utm_content, 200) || null,
      referrer: clean(payload._ext_referrer, 500) || null,
      email_transport: transport.name,
      $set: { persona: p.persona, org_domain: p.org_domain, model_requested_at: p.requested_at },
    }),
  );

  return api(env, { ok: true });
}

// ---------- GET /auth ----------

async function handleAuth(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const expired = redirect('/?state=expired');
  const nonce = await verifyLinkToken(env.SESSION_SECRET, url.searchParams.get('t'));
  if (!nonce || !env.SESSION_SECRET) return expired;

  const now = Date.now();
  const ttl = linkTtlSeconds(env);
  const rec = await env.MODEL_KV.get<LinkRecord>(`ml:${nonce}`, 'json');
  if (!rec || now - rec.issued_at > ttl * 1000) {
    if (rec) await env.MODEL_KV.delete(`ml:${nonce}`);
    const tomb = await env.MODEL_KV.get<LinkRecord>(`mlx:${nonce}`, 'json');
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ua = request.headers.get('user-agent') || '';
    const distinctId = tomb?.email_hash || `model_link_${nonce.slice(0, 16)}`;
    ctx.waitUntil(
      (async () =>
        posthogCapture(ph(env), 'model_link_reuse_attempt', distinctId, {
          reason: tomb?.used_at ? 'used' : 'expired',
          link_issued_at: tomb ? isoNow(tomb.issued_at) : null,
          minutes_since_issue: tomb ? Math.round((now - tomb.issued_at) / 60000) : null,
          ip_hash: ip ? (await sha256(ip)).slice(0, 16) : null,
          ua_hash: ua ? (await sha256(ua)).slice(0, 16) : null,
        }))(),
    );
    return expired;
  }

  // Single use: delete before anything else.
  await env.MODEL_KV.delete(`ml:${nonce}`);
  const hash = rec.email_hash;
  await env.MODEL_KV.put(`mlx:${nonce}`, JSON.stringify({ ...rec, used_at: now }), { expirationTtl: TOMBSTONE_TTL });
  if ((await env.MODEL_KV.get(`mlcur:${hash}`)) === nonce) await env.MODEL_KV.delete(`mlcur:${hash}`);
  if (await isRevoked(env, hash)) return expired;

  const p = await getPerson(env, hash);
  if (p) {
    p.verified_at = isoNow(now);
    p.stage = advanceStage(p.stage, 'Verified');
    await putPerson(env, hash, p);
    ctx.waitUntil(attioStamp(env, hash, p, ['stage', 'verified_at']));
  }
  ctx.waitUntil(
    posthogCapture(ph(env), 'model_access_verified', hash, {
      persona: p?.persona ?? null,
      org_domain: p?.org_domain ?? null,
      minutes_to_verify: Math.round((now - rec.issued_at) / 60000),
      $set: {
        email: p?.email ?? undefined,
        persona: p?.persona ?? undefined,
        org_domain: p?.org_domain ?? undefined,
        model_verified_at: isoNow(now),
      },
    }),
  );

  const maxAge = sessionTtlSeconds(env);
  const cookie = await signSession(env.SESSION_SECRET, hash, now);
  return redirect('/', { 'set-cookie': sessionCookieHeader(cookie, maxAge) });
}

// ---------- GET /me ----------

/**
 * Identity for client telemetry. Each success counts a visit once per UTC day and moves the
 * viewer to Viewed on the first one.
 */
async function handleMe(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const s = await getSession(request, env);
  if (!s) return api(env, { ok: false, error: 'Unauthorized.' }, 401);
  const p = await getPerson(env, s.email_hash);
  if (p) {
    const now = Date.now();
    const today = utcDay(now);
    const newVisit = p.last_visit_day !== today;
    const before = p.stage;
    if (newVisit) {
      p.visit_count = (p.visit_count || 0) + 1;
      p.last_visit_day = today;
    }
    p.last_viewed_at = isoNow(now);
    p.stage = advanceStage(p.stage, 'Viewed');
    await putPerson(env, s.email_hash, p);
    if (newVisit || before !== p.stage) {
      ctx.waitUntil(attioStamp(env, s.email_hash, p, ['stage', 'last_viewed_at', 'visit_count']));
      ctx.waitUntil(
        posthogSetPerson(ph(env), s.email_hash, { model_visit_count: p.visit_count, model_last_seen: p.last_viewed_at }),
      );
    }
  }
  return api(env, {
    email_hash: s.email_hash,
    email: p?.email ?? null,
    first_name: p?.first_name ?? null,
    persona: p?.persona ?? null,
    org_domain: p?.org_domain ?? null,
    visit_count: p?.visit_count ?? 0,
  });
}

// ---------- POST /api/engagement ----------

interface EngagementPayload {
  engaged_seconds?: unknown;
  sections_seen?: unknown;
  final_scenario?: unknown;
  cta?: unknown;
  /** Server-to-server only (x-admin-token), for the PostHog webhook destination. */
  email?: unknown;
  email_hash?: unknown;
}

function adminOk(request: Request, env: Env): boolean {
  const given = request.headers.get('x-admin-token') || '';
  return !!env.ADMIN_TOKEN && !!given && constantTimeEqual(given, env.ADMIN_TOKEN);
}

async function handleEngagement(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await readJsonBody<EngagementPayload>(request);
  if (!body) return api(env, { ok: false, error: 'Invalid JSON.' }, 400);

  let hash: string | null = null;
  const s = await getSession(request, env);
  if (s) hash = s.email_hash;
  else if (adminOk(request, env)) {
    const eh = clean(body.email_hash, 64).toLowerCase();
    const em = clean(body.email, 254).toLowerCase();
    hash = /^[0-9a-f]{64}$/.test(eh) ? eh : em && isValidEmail(em) ? await emailHash(em) : null;
    if (!hash) return api(env, { ok: false, error: 'email or email_hash required.' }, 400);
    if (await isRevoked(env, hash)) return api(env, { ok: false, error: 'Revoked.' }, 403);
  }
  if (!hash) return api(env, { ok: false, error: 'Unauthorized.' }, 401);

  const p = await getPerson(env, hash);
  if (!p) return api(env, { ok: false, error: 'Unknown viewer.' }, 404);

  const now = Date.now();
  // Per-beacon delta of visible-tab seconds since the previous beacon; summed. Capped per beacon
  // so one malformed or hostile beacon cannot jump the viewer to Engaged on its own.
  const delta = Math.min(Math.max(Math.floor(Number(body.engaged_seconds) || 0), 0), MAX_BEACON_SECONDS);
  const sections = Array.isArray(body.sections_seen)
    ? body.sections_seen.map((x) => clean(x, 64)).filter(Boolean)
    : [];
  p.sections_seen = [...new Set([...(p.sections_seen || []), ...sections])].slice(0, 100);
  const scenario = clean(body.final_scenario, 100);
  if (scenario) p.final_scenario = scenario;
  const cta = clean(body.cta, 64);
  if (cta) p.last_cta = cta;

  p.total_engaged_seconds = (p.total_engaged_seconds || 0) + delta;
  p.last_viewed_at = isoNow(now);
  const before = p.stage;
  p.stage = advanceStage(p.stage, 'Viewed');
  if (p.total_engaged_seconds >= ENGAGED_SECONDS || cta) p.stage = advanceStage(p.stage, 'Engaged');
  await putPerson(env, hash, p);

  ctx.waitUntil(
    attioStamp(env, hash, p, ['stage', 'last_viewed_at', 'visit_count', 'engaged_seconds', 'final_scenario']),
  );
  ctx.waitUntil(
    posthogSetPerson(ph(env), hash, {
      model_visit_count: p.visit_count,
      model_last_seen: p.last_viewed_at,
      model_total_engaged_seconds: p.total_engaged_seconds,
      model_sections_seen: p.sections_seen.length,
      ...(p.final_scenario ? { model_final_scenario: p.final_scenario } : {}),
      ...(p.last_cta ? { model_last_cta: p.last_cta } : {}),
    }),
  );

  return api(env, { ok: true, stage: p.stage, stage_changed: before !== p.stage });
}

// ---------- POST /api/revoke ----------

async function handleRevoke(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!adminOk(request, env)) return api(env, { ok: false, error: 'Unauthorized.' }, 401);
  const body = await readJsonBody<{ email?: unknown }>(request);
  const email = clean(body?.email, 254).toLowerCase();
  if (!email || !isValidEmail(email)) return api(env, { ok: false, error: 'A valid email is required.' }, 400);

  const hash = await emailHash(email);
  await env.MODEL_KV.put(`revoked:${hash}`, JSON.stringify({ revoked_at: isoNow() }));
  const current = await env.MODEL_KV.get(`mlcur:${hash}`);
  if (current) {
    await env.MODEL_KV.delete(`ml:${current}`);
    await env.MODEL_KV.delete(`mlcur:${hash}`);
  }
  const p = await getPerson(env, hash);
  if (p) {
    p.stage = 'Revoked';
    await putPerson(env, hash, p);
    ctx.waitUntil(attioStamp(env, hash, p, ['stage']));
  }
  return api(env, { ok: true, email_hash: hash });
}

// ---------- gate ----------

async function handleAsset(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return api(env, { ok: false, error: 'Method not allowed.' }, 405);
  }
  const path = new URL(request.url).pathname;
  if (await getSession(request, env)) return serveGatedAsset(env, request);
  // No session: the form in place at /, its allowlisted dependencies as-is, nothing else.
  if (path === '/') return serveRequestForm(env, request);
  if (isPublicAsset(path)) return servePublicAsset(env, request);
  if (isNavigation(request)) return redirect(REQUEST_PAGE);
  return api(env, { ok: false, error: 'Unauthorized.' }, 401);
}

// ---------- router ----------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;
    const m = request.method;

    if (m === 'OPTIONS' && (path.startsWith('/api/') || path === '/me')) {
      return new Response(null, { status: 204, headers: corsHeaders(env.ALLOWED_ORIGIN) });
    }

    switch (path) {
      case '/api/request':
        if (m === 'GET') {
          if (!env.CSRF_SECRET) return api(env, { ok: false, error: 'Service not configured.' }, 500);
          return api(env, { csrf_token: await issueCsrf(env.CSRF_SECRET) });
        }
        if (m === 'POST') return handleRequest(request, env, ctx);
        return api(env, { ok: false, error: 'Method not allowed.' }, 405);
      case '/auth':
        if (m === 'GET') return handleAuth(request, env, ctx);
        return api(env, { ok: false, error: 'Method not allowed.' }, 405);
      case '/me':
        if (m === 'GET') return handleMe(request, env, ctx);
        return api(env, { ok: false, error: 'Method not allowed.' }, 405);
      case '/api/engagement':
        if (m === 'POST') return handleEngagement(request, env, ctx);
        return api(env, { ok: false, error: 'Method not allowed.' }, 405);
      case '/api/revoke':
        if (m === 'POST') return handleRevoke(request, env, ctx);
        return api(env, { ok: false, error: 'Method not allowed.' }, 405);
    }
    if (path.startsWith('/api/')) return api(env, { ok: false, error: 'Not found.' }, 404);
    return handleAsset(request, env);
  },
} satisfies ExportedHandler<Env>;
