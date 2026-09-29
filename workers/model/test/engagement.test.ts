import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailHash } from '../../lib/crypto';
import { advanceStage } from '../src/store';
import { call, clearKv, get, makeEnv, mockFetch, ORIGIN, SECRETS, signIn } from './helpers';

beforeEach(async () => {
  await clearKv();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function beacon(cookie: string | undefined, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/engagement`, {
    method: 'POST',
    // sendBeacon with a Blob of JSON; content type is set by the page.
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function person(email = 'ada@capital.example') {
  return makeEnv().MODEL_KV.get<any>(`person:${await emailHash(email)}`, 'json');
}

function lastEntry(mock: ReturnType<typeof mockFetch>) {
  const e = mock.listEntries();
  return e[e.length - 1].body.data.entry_values;
}

describe('stage logic', () => {
  it('moves forward only, and Revoked always wins', () => {
    expect(advanceStage(undefined, 'Requested')).toBe('Requested');
    expect(advanceStage('Engaged', 'Requested')).toBe('Engaged');
    expect(advanceStage('Verified', 'Viewed')).toBe('Viewed');
    expect(advanceStage('Viewed', 'Verified')).toBe('Viewed');
    expect(advanceStage('Engaged', 'Revoked')).toBe('Revoked');
    expect(advanceStage('Revoked', 'Engaged')).toBe('Revoked');
  });
});

describe('/me', () => {
  it('requires a session', async () => {
    mockFetch();
    expect((await call(get('/me'))).status).toBe(401);
  });

  it('returns identity, marks Viewed on first success, counts one visit per day', async () => {
    const mock = mockFetch();
    const cookie = await signIn(mock);
    expect(lastEntry(mock).stage).toBe('Verified');
    expect(Date.parse(lastEntry(mock).verified_at)).not.toBeNaN();

    const res = await call(get('/me', cookie));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toEqual({
      email_hash: await emailHash('ada@capital.example'),
      email: 'ada@capital.example',
      first_name: 'Ada',
      persona: 'Investor',
      org_domain: 'capital.example',
      visit_count: 1,
    });
    expect(lastEntry(mock)).toMatchObject({ stage: 'Viewed', visit_count: 1 });

    const writes = mock.listEntries().length;
    const again = (await (await call(get('/me', cookie))).json()) as { visit_count: number };
    expect(again.visit_count).toBe(1);
    expect(mock.listEntries()).toHaveLength(writes); // nothing new to tell Attio

    // Next UTC day: a new visit.
    const p = await person();
    p.last_visit_day = '2000-01-01';
    await makeEnv().MODEL_KV.put(`person:${await emailHash('ada@capital.example')}`, JSON.stringify(p));
    const next = (await (await call(get('/me', cookie))).json()) as { visit_count: number };
    expect(next.visit_count).toBe(2);
    expect(lastEntry(mock).visit_count).toBe(2);
  });
});

describe('POST /api/engagement', () => {
  it('requires a session', async () => {
    mockFetch();
    const res = await call(beacon(undefined, { engaged_seconds: 10 }));
    expect(res.status).toBe(401);
  });

  it('sums per-beacon deltas and moves Viewed to Engaged at 180 seconds', async () => {
    const mock = mockFetch();
    const cookie = await signIn(mock);
    await call(get('/me', cookie));

    let r = await call(beacon(cookie, { engaged_seconds: 100, sections_seen: ['summary', 'dilution'], final_scenario: null, cta: null }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, stage: 'Viewed' });
    expect(lastEntry(mock)).toMatchObject({ stage: 'Viewed', engaged_seconds: 100 });

    r = await call(beacon(cookie, { engaged_seconds: 79, sections_seen: ['dilution', 'runway'], final_scenario: 'base', cta: null }));
    expect(await r.json()).toMatchObject({ stage: 'Viewed' });

    r = await call(beacon(cookie, { engaged_seconds: 1, sections_seen: [], final_scenario: null, cta: null }));
    expect(await r.json()).toMatchObject({ stage: 'Engaged', stage_changed: true });
    expect(lastEntry(mock)).toMatchObject({ stage: 'Engaged', engaged_seconds: 180, final_scenario: 'base', visit_count: 1 });

    const p = await person();
    expect(p.total_engaged_seconds).toBe(180);
    expect(p.sections_seen.sort()).toEqual(['dilution', 'runway', 'summary']);
    expect(p.final_scenario).toBe('base');
    expect(Date.parse(p.last_viewed_at)).not.toBeNaN();

    const set = mock.posthog('$set');
    expect(set[set.length - 1].body.properties.$set).toMatchObject({
      model_visit_count: 1,
      model_total_engaged_seconds: 180,
      model_sections_seen: 3,
      model_final_scenario: 'base',
    });
  });

  it('moves to Engaged on any non-null cta and records it', async () => {
    const mock = mockFetch();
    const cookie = await signIn(mock, { email: 'cta@capital.example' });
    const r = await call(beacon(cookie, { engaged_seconds: 5, sections_seen: [], final_scenario: null, cta: 'book_call' }));
    expect(await r.json()).toMatchObject({ stage: 'Engaged' });
    expect((await person('cta@capital.example')).last_cta).toBe('book_call');
    expect(lastEntry(mock).stage).toBe('Engaged');
  });

  it('never moves a viewer backwards and caps a single beacon', async () => {
    const mock = mockFetch();
    const cookie = await signIn(mock, { email: 'cap@capital.example' });
    const r = await call(beacon(cookie, { engaged_seconds: 1_000_000, sections_seen: [], final_scenario: null, cta: null }));
    expect(await r.json()).toMatchObject({ stage: 'Engaged' });
    expect((await person('cap@capital.example')).total_engaged_seconds).toBe(600);
    await call(get('/me', cookie));
    expect(lastEntry(mock).stage).toBe('Engaged');
  });

  it('accepts a text/plain sendBeacon body and ignores junk values', async () => {
    const mock = mockFetch();
    const cookie = await signIn(mock, { email: 'beacon@capital.example' });
    const r = await call(
      beacon(cookie, JSON.stringify({ engaged_seconds: 'abc', sections_seen: 'nope', final_scenario: null, cta: null }), {
        'content-type': 'text/plain;charset=UTF-8',
      }),
    );
    expect(r.status).toBe(200);
    const p = await person('beacon@capital.example');
    expect(p.total_engaged_seconds).toBe(0);
    expect(p.sections_seen).toEqual([]);
    expect((await call(beacon(cookie, 'not json'))).status).toBe(400);
  });

  it('accepts server-to-server calls with the admin token and an email_hash', async () => {
    const mock = mockFetch();
    await signIn(mock, { email: 'hook@capital.example' });
    const hash = await emailHash('hook@capital.example');
    const bad = await call(beacon(undefined, { email_hash: hash, cta: 'email_mene' }, { 'x-admin-token': 'wrong' }));
    expect(bad.status).toBe(401);
    const view = await call(beacon(undefined, { email_hash: hash, cta: 'null' }, { 'x-admin-token': SECRETS.ADMIN_TOKEN }));
    expect(await view.json()).toMatchObject({ stage: 'Viewed' });
    const ok = await call(beacon(undefined, { email_hash: hash, cta: 'email_mene' }, { 'x-admin-token': SECRETS.ADMIN_TOKEN }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ stage: 'Engaged' });
  });

  it('keeps working when Attio errors', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mock = mockFetch({ list: 'error' });
    const cookie = await signIn(mock, { email: 'down@capital.example' });
    const r = await call(beacon(cookie, { engaged_seconds: 200, sections_seen: [], final_scenario: null, cta: null }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ stage: 'Engaged' });
  });
});
