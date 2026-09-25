import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailHash, verifyCsrf } from '../../lib/crypto';
import { validateRequest } from '../src/index';
import { call, clearKv, csrfToken, makeEnv, mockFetch, ORIGIN, postRequest, requestBody, SECRETS } from './helpers';

beforeEach(async () => {
  await clearKv();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function errorsOf(res: Response): Promise<Record<string, string>> {
  expect(res.status).toBe(400);
  return ((await res.json()) as { errors: Record<string, string> }).errors;
}

describe('GET /api/request', () => {
  it('returns a CSRF token in the lead worker scheme', async () => {
    const res = await call(new Request(`${ORIGIN}/api/request`));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const { csrf_token } = (await res.json()) as { csrf_token: string };
    expect(csrf_token).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(await verifyCsrf(SECRETS.CSRF_SECRET, csrf_token)).toBe(true);
  });
});

describe('POST /api/request validation', () => {
  it('silently accepts a filled honeypot without sending or writing', async () => {
    const mock = mockFetch();
    const res = await postRequest(requestBody({ _honeypot: 'https://spam.example' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mock.resend()).toHaveLength(0);
    expect(mock.attio()).toHaveLength(0);
  });

  it('rejects a missing or forged CSRF token', async () => {
    const mock = mockFetch();
    expect((await postRequest(requestBody(), { csrf: null })).status).toBe(403);
    expect((await postRequest(requestBody(), { csrf: `${Date.now()}.${'0'.repeat(64)}` })).status).toBe(403);
    const stale = `${Date.now() - 3 * 60 * 60 * 1000}.${'0'.repeat(64)}`;
    expect((await postRequest(requestBody(), { csrf: stale })).status).toBe(403);
    expect(mock.resend()).toHaveLength(0);
  });

  it('rejects invalid JSON', async () => {
    mockFetch();
    const res = await call(
      new Request(`${ORIGIN}/api/request`, { method: 'POST', body: 'not json', headers: { 'content-type': 'application/json' } }),
    );
    expect(res.status).toBe(400);
  });

  it('blocks disposable email domains', async () => {
    mockFetch();
    const errors = await errorsOf(await postRequest(requestBody({ email: 'someone@mailinator.com' })));
    expect(errors.email).toBe('Please use a work email address.');
  });

  it('blocks domains with no mail records', async () => {
    mockFetch({ noMailDomains: ['nomail.example'] });
    const errors = await errorsOf(await postRequest(requestBody({ email: 'x@nomail.example' })));
    expect(errors.email).toMatch(/does not appear to receive mail/);
  });

  it('applies the PHI guard to free-text fields', async () => {
    const mock = mockFetch();
    const org = await errorsOf(await postRequest(requestBody({ organization: 'Patient name Jane, MRN 12345' })));
    expect(org.organization).toMatch(/patient information/);
    const role = await errorsOf(await postRequest(requestBody({ role: 'Nurse, see DOB and SSN' }), { ip: '198.51.100.2' }));
    expect(role.role).toMatch(/patient information/);
    expect(mock.resend()).toHaveLength(0);
    expect(mock.attio()).toHaveLength(0);
  });

  it('requires consent', async () => {
    mockFetch();
    const errors = await errorsOf(await postRequest(requestBody({ consent: false })));
    expect(errors.consent).toBeTruthy();
    const missing = { ...requestBody() };
    delete missing.consent;
    expect((await errorsOf(await postRequest(missing, { ip: '198.51.100.3' }))).consent).toBeTruthy();
  });

  it('requires names, organization, role and a known persona; LinkedIn is optional but must be a LinkedIn URL', async () => {
    const v = validateRequest(requestBody({ first_name: '', last_name: ' ', organization: '', role: '', persona: 'Journalist' }));
    expect(v.ok).toBe(false);
    expect(Object.keys(v.errors).sort()).toEqual(['first_name', 'last_name', 'organization', 'persona', 'role']);

    const noLinkedIn = validateRequest(requestBody({ linkedin: '' }));
    expect(noLinkedIn.ok).toBe(true);
    expect(validateRequest(requestBody({ linkedin: 'https://evil.example/in/x' })).errors.linkedin).toBeTruthy();

    const ok = validateRequest(requestBody({ persona: 'hospital operator', email: '  Ada@Capital.Example ' }));
    expect(ok.ok).toBe(true);
    expect(ok.data.persona).toBe('Hospital operator');
    expect(ok.data.email).toBe('ada@capital.example');
  });
});

describe('POST /api/request side effects', () => {
  it('upserts the Attio person and a Requested Model Access entry, and captures the request', async () => {
    const mock = mockFetch();
    const res = await postRequest(requestBody());
    expect(res.status).toBe(200);

    const person = mock.people()[0];
    expect(person.method).toBe('PUT');
    expect(person.url).toContain('matching_attribute=email_addresses');
    const values = person.body.data.values;
    expect(values.email_addresses).toEqual([{ email_address: 'ada@capital.example' }]);
    expect(values.job_title).toEqual([{ value: 'Partner' }]);
    expect(values.persona_type).toEqual([{ value: 'Investor' }]);
    expect(values.linkedin).toEqual([{ value: 'https://www.linkedin.com/in/example' }]);
    expect(values.company).toEqual([{ target_object: 'companies', target_record_id: 'company_rec_1' }]);

    const entry = mock.listEntries()[0];
    expect(entry.method).toBe('PUT');
    expect(entry.body.data.parent_object).toBe('people');
    expect(entry.body.data.parent_record_id).toBe('person_rec_1');
    const ev = entry.body.data.entry_values;
    expect(ev.stage).toBe('Requested');
    expect(ev.request_source).toBe('model_gate');
    expect(ev.utm_source).toBe('linkedin');
    expect(ev.utm_campaign).toBe('seed');
    expect(Date.parse(ev.requested_at)).not.toBeNaN();

    const ph = mock.posthog('model_access_requested');
    expect(ph).toHaveLength(1);
    expect(ph[0].body.distinct_id).toBe(await emailHash('ada@capital.example'));
    expect(ph[0].body.properties.persona).toBe('Investor');
    expect(ph[0].body.properties.org_domain).toBe('capital.example');
    expect(ph[0].body.properties.request_count).toBe(1);
  });

  it('returns ok and still sends the link when the Model Access list is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mock = mockFetch({ list: 'missing_list' });
    const res = await postRequest(requestBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mock.resend()).toHaveLength(1);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('not found'))).toBe(true);
  });

  it('drops a missing list attribute and retries the entry write', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mock = mockFetch({ missingEntryAttributes: ['utm_campaign'] });
    await postRequest(requestBody());
    const entries = mock.listEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].body.data.entry_values.utm_campaign).toBe('seed');
    expect(entries[1].body.data.entry_values.utm_campaign).toBeUndefined();
    expect(entries[1].body.data.entry_values.stage).toBe('Requested');
  });

  it('drops a missing person attribute and retries the upsert', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mock = mockFetch({ missingPersonAttributes: ['persona_type'] });
    await postRequest(requestBody());
    const people = mock.people();
    expect(people).toHaveLength(2);
    expect(people[1].body.data.values.persona_type).toBeUndefined();
    expect(mock.listEntries()).toHaveLength(1);
  });

  it('returns ok when Resend fails, without leaking the failure', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch({ resendStatus: 500 });
    const res = await postRequest(requestBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(err).toHaveBeenCalled();
  });

  it('logs the link instead of sending when EMAIL_TRANSPORT=log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mock = mockFetch();
    const env = makeEnv({ EMAIL_TRANSPORT: 'log' });
    const res = await postRequest(requestBody(), { env });
    expect(res.status).toBe(200);
    expect(mock.resend()).toHaveLength(0);
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain(`${ORIGIN}/auth?t=`);
    expect(printed).toContain('Your Metrias model access link');
  });
});

describe('rate limits', () => {
  it('allows 5 requests per IP per hour, then 429', async () => {
    mockFetch();
    const env = makeEnv();
    const csrf = await csrfToken(env);
    for (let i = 0; i < 5; i++) {
      const r = await postRequest(requestBody({ email: `p${i}@capital.example` }), { ip: '192.0.2.1', env, csrf });
      expect(r.status).toBe(200);
    }
    const sixth = await postRequest(requestBody({ email: 'p6@capital.example' }), { ip: '192.0.2.1', env, csrf });
    expect(sixth.status).toBe(429);
    const otherIp = await postRequest(requestBody({ email: 'p7@capital.example' }), { ip: '192.0.2.2', env, csrf });
    expect(otherIp.status).toBe(200);
  });

  it('sends at most 3 links per email per day and answers ok regardless', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const mock = mockFetch();
    for (let i = 0; i < 5; i++) {
      const r = await postRequest(requestBody(), { ip: `192.0.2.${10 + i}` });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ok: true });
    }
    expect(mock.resend()).toHaveLength(3);
  });

  it('does not count invalid submissions against the IP limit', async () => {
    mockFetch();
    for (let i = 0; i < 6; i++) {
      expect((await postRequest(requestBody({ consent: false }), { ip: '192.0.2.50' })).status).toBe(400);
    }
    expect((await postRequest(requestBody(), { ip: '192.0.2.50' })).status).toBe(200);
  });
});
