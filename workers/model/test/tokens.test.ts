import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailHash, randomHex } from '../../lib/crypto';
import { signLink, signSession, verifyLinkToken, verifySessionValue } from '../src/tokens';
import {
  auth,
  call,
  clearKv,
  get,
  linkFromEmail,
  makeEnv,
  mockFetch,
  ORIGIN,
  postRequest,
  requestBody,
  SECRETS,
  signIn,
} from './helpers';

beforeEach(async () => {
  await clearKv();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('link tokens', () => {
  const secret = SECRETS.SESSION_SECRET;

  it('verifies a signed nonce and rejects tampering', async () => {
    const nonce = randomHex(16);
    const token = await signLink(secret, nonce);
    expect(await verifyLinkToken(secret, token)).toBe(nonce);

    const [n, sig] = token.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    expect(await verifyLinkToken(secret, `${n}.${flipped}`)).toBeNull();
    expect(await verifyLinkToken(secret, `${randomHex(16)}.${sig}`)).toBeNull();
    expect(await verifyLinkToken('another-secret', token)).toBeNull();
    expect(await verifyLinkToken(secret, 'garbage')).toBeNull();
    expect(await verifyLinkToken(secret, `${nonce}.${sig}.extra`)).toBeNull();
    expect(await verifyLinkToken(secret, null)).toBeNull();
  });

  it('issues a link that works once, sets the session cookie and redirects to /', async () => {
    const mock = mockFetch();
    const r = await postRequest(requestBody());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });

    const sent = mock.resend();
    expect(sent).toHaveLength(1);
    expect(sent[0].body.subject).toBe('Your Metrias model access link');
    expect(sent[0].body.from).toBe('access@metriasmedical.com');
    expect(sent[0].body.to).toEqual(['ada@capital.example']);
    expect(sent[0].body.text).toContain(`${ORIGIN}/auth?t=`);
    expect(sent[0].body.text).toContain('expires in 15 minutes');
    expect(sent[0].body.html).toContain('<a href="https://model.metriasmedical.com/auth?t=');
    expect(sent[0].headers.authorization).toBe(`Bearer ${SECRETS.RESEND_API_KEY}`);

    const token = linkFromEmail(sent[0]);
    const first = await auth(token);
    expect(first.status).toBe(302);
    expect(first.headers.get('location')).toBe('/');
    const setCookie = first.headers.get('set-cookie') || '';
    expect(setCookie).toMatch(/^mm_model_session=[0-9a-f]{64}\.\d+\.[0-9a-f]{64};/);
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']) {
      expect(setCookie).toContain(attr);
    }
    const hash = await emailHash('ada@capital.example');
    expect(setCookie).toContain(`mm_model_session=${hash}.`);
    expect(mock.posthog('model_access_verified')).toHaveLength(1);
    expect(mock.posthog('model_access_verified')[0].body.distinct_id).toBe(hash);

    // Second use: rejected, telemetry names the person.
    const second = await auth(token);
    expect(second.status).toBe(302);
    expect(second.headers.get('location')).toBe('/?state=expired');
    expect(second.headers.get('set-cookie')).toBeNull();
    const reuse = mock.posthog('model_link_reuse_attempt');
    expect(reuse).toHaveLength(1);
    expect(reuse[0].body.distinct_id).toBe(hash);
    expect(reuse[0].body.properties.reason).toBe('used');
  });

  it('rejects an expired link and records the attempt', async () => {
    const mock = mockFetch();
    const env = makeEnv();
    const hash = await emailHash('late@capital.example');
    const nonce = randomHex(16);
    const issued = Date.now() - 16 * 60 * 1000; // 16 minutes ago, past the 15 minute TTL
    await env.MODEL_KV.put(`ml:${nonce}`, JSON.stringify({ email_hash: hash, issued_at: issued }));
    await env.MODEL_KV.put(`mlx:${nonce}`, JSON.stringify({ email_hash: hash, issued_at: issued }));
    const res = await auth(await signLink(SECRETS.SESSION_SECRET, nonce));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?state=expired');
    expect(res.headers.get('set-cookie')).toBeNull();
    const reuse = mock.posthog('model_link_reuse_attempt');
    expect(reuse).toHaveLength(1);
    expect(reuse[0].body.properties.reason).toBe('expired');
    expect(await env.MODEL_KV.get(`ml:${nonce}`)).toBeNull();
  });

  it('rejects a forged token without telemetry', async () => {
    const mock = mockFetch();
    const res = await auth(`${randomHex(16)}.${randomHex(32)}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?state=expired');
    expect(mock.posthog('model_link_reuse_attempt')).toHaveLength(0);
  });

  it('rotates the nonce on re-request so only the newest link works', async () => {
    const mock = mockFetch();
    await postRequest(requestBody(), { ip: '203.0.113.30' });
    await postRequest(requestBody(), { ip: '203.0.113.30' });
    const [a, b] = mock.resend().map(linkFromEmail);
    expect(a).not.toBe(b);
    expect((await auth(a)).headers.get('location')).toBe('/?state=expired');
    expect((await auth(b)).headers.get('location')).toBe('/');
  });
});

describe('session cookies', () => {
  const secret = SECRETS.SESSION_SECRET;
  const ttl = 2592000;

  it('verifies a signed cookie and rejects tampering, age and the wrong key', async () => {
    const hash = await emailHash('c@capital.example');
    const now = Date.now();
    const value = await signSession(secret, hash, now);
    expect(await verifySessionValue(secret, value, ttl, now)).toEqual({ email_hash: hash, issued_at: now });

    const other = await emailHash('d@capital.example');
    const [, issued, sig] = value.split('.');
    expect(await verifySessionValue(secret, `${other}.${issued}.${sig}`, ttl, now)).toBeNull();
    expect(await verifySessionValue(secret, `${hash}.${now + 1}.${sig}`, ttl, now)).toBeNull();
    expect(await verifySessionValue('another-secret', value, ttl, now)).toBeNull();
    expect(await verifySessionValue(secret, value, ttl, now + ttl * 1000 + 1)).toBeNull();
    expect(await verifySessionValue(secret, await signSession(secret, hash, now + 10 * 60_000), ttl, now)).toBeNull();
    expect(await verifySessionValue(secret, 'x.y.z', ttl, now)).toBeNull();
    expect(await verifySessionValue(secret, undefined, ttl, now)).toBeNull();
  });

  it('a link signature never passes as a cookie signature', async () => {
    const hash = await emailHash('e@capital.example');
    const link = await signLink(secret, randomHex(16));
    const sig = link.split('.')[1];
    expect(await verifySessionValue(secret, `${hash}.${Date.now()}.${sig}`, ttl)).toBeNull();
  });

  it('an expired cookie gets the form, not the model', async () => {
    mockFetch();
    const hash = await emailHash('old@capital.example');
    const old = Date.now() - (ttl + 60) * 1000;
    const cookie = `mm_model_session=${await signSession(secret, hash, old)}`;
    const res = await call(get('/', cookie));
    expect(await res.text()).toContain('REQUEST_FORM');
    expect((await call(get('/me', cookie))).status).toBe(401);
  });

  it('revocation kills the session and stops new links', async () => {
    const mock = mockFetch();
    const cookie = await signIn(mock, { email: 'revoke.me@capital.example' });
    expect((await call(get('/me', cookie))).status).toBe(200);

    const revokeReq = (headers: Record<string, string>) =>
      new Request(`${ORIGIN}/api/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ email: 'Revoke.Me@capital.example' }),
      });
    expect((await call(revokeReq({}))).status).toBe(401);
    expect((await call(revokeReq({ 'x-admin-token': 'wrong' }))).status).toBe(401);
    const ok = await call(revokeReq({ 'x-admin-token': SECRETS.ADMIN_TOKEN }));
    expect(ok.status).toBe(200);
    const hash = await emailHash('revoke.me@capital.example');
    expect(await ok.json()).toEqual({ ok: true, email_hash: hash });
    expect(await makeEnv().MODEL_KV.get(`revoked:${hash}`)).not.toBeNull();

    expect((await call(get('/me', cookie))).status).toBe(401);
    expect(await (await call(get('/', cookie))).text()).toContain('REQUEST_FORM');
    const entries = mock.listEntries();
    expect(entries[entries.length - 1].body.data.entry_values.stage).toBe('Revoked');

    const sentBefore = mock.resend().length;
    const again = await postRequest(requestBody({ email: 'revoke.me@capital.example' }), { ip: '203.0.113.99' });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true });
    expect(mock.resend()).toHaveLength(sentBefore);
  });

  it('a link issued before revocation cannot be used after it', async () => {
    const mock = mockFetch();
    await postRequest(requestBody({ email: 'pending@capital.example' }), { ip: '203.0.113.31' });
    const token = linkFromEmail(mock.resend()[0]);
    await call(
      new Request(`${ORIGIN}/api/revoke`, {
        method: 'POST',
        headers: { 'x-admin-token': SECRETS.ADMIN_TOKEN },
        body: JSON.stringify({ email: 'pending@capital.example' }),
      }),
    );
    const res = await auth(token);
    expect(res.headers.get('location')).toBe('/?state=expired');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
