/**
 * Minimal Attio v2 client shared by Metrias Workers.
 *
 * Copied from workers/lead/src/index.ts (fetch wrapper, company, person, note) and extended with
 * list-entry upsert. Every writer that sends a map of attribute values prunes attributes Attio
 * reports as unknown and retries, so a missing attribute degrades one field, not the write.
 */

export const ATTIO_BASE = 'https://api.attio.com/v2';

export interface AttioConfig {
  token: string | undefined;
  /** Logger for degraded writes. Defaults to console.warn. */
  log?: (msg: string) => void;
}

export class AttioError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message);
  }
}

function warn(cfg: AttioConfig, msg: string): void {
  (cfg.log || ((m: string) => console.warn(m)))(`[attio] ${msg}`);
}

export async function attioFetch(cfg: AttioConfig, path: string, init: RequestInit = {}): Promise<Response> {
  if (!cfg.token) throw new AttioError('ATTIO_API_TOKEN is not set', 0, '');
  return fetch(`${ATTIO_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      'content-type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    },
  });
}

/**
 * Given an Attio error body and the value map that was sent, return the attribute slugs the
 * error names. Attio reports unknown attributes with the slug in quotes in `message`.
 */
export function unknownAttributesInError(body: string, values: Record<string, unknown>): string[] {
  let message = body;
  try {
    const j = JSON.parse(body);
    message = `${j?.code || ''} ${j?.message || ''}`;
  } catch {
    /* plain-text body */
  }
  if (!/attribute|value_not_found|not.found|unknown/i.test(message)) return [];
  return Object.keys(values).filter((slug) => message.includes(`"${slug}"`) || message.includes(`'${slug}'`));
}

/**
 * Send `values` through `send`, pruning any attribute Attio names as unknown and retrying.
 * Returns the final successful Response, or throws AttioError when the write cannot succeed.
 */
export async function writeWithPrune(
  cfg: AttioConfig,
  label: string,
  values: Record<string, unknown>,
  send: (values: Record<string, unknown>) => Promise<Response>,
  maxPrunes = 5,
): Promise<Response> {
  let current = { ...values };
  for (let attempt = 0; attempt <= maxPrunes; attempt++) {
    const r = await send(current);
    if (r.ok) return r;
    const body = await r.text();
    const missing = r.status === 400 ? unknownAttributesInError(body, current) : [];
    if (!missing.length) throw new AttioError(`${label} failed: ${r.status} ${body}`, r.status, body);
    warn(cfg, `${label}: attribute(s) missing in Attio, skipping: ${missing.join(', ')}`);
    for (const slug of missing) delete current[slug];
    if (!Object.keys(current).length) throw new AttioError(`${label}: no writable attributes left`, r.status, body);
  }
  throw new AttioError(`${label}: gave up after pruning`, 400, '');
}

/**
 * Find a company by exact name, or create it. Returns the record id, or null on any failure
 * (company linkage is a nice-to-have; Attio also links companies from the email domain).
 */
export async function findOrCreateCompany(cfg: AttioConfig, name: string): Promise<string | null> {
  if (!name) return null;
  try {
    const q = await attioFetch(cfg, '/objects/companies/records/query', {
      method: 'POST',
      body: JSON.stringify({ filter: { name }, limit: 1 }),
    });
    if (q.ok) {
      const j: any = await q.json();
      const found = j?.data?.[0]?.id?.record_id;
      if (found) return found;
    }
    const c = await attioFetch(cfg, '/objects/companies/records', {
      method: 'POST',
      body: JSON.stringify({ data: { values: { name: [{ value: name }] } } }),
    });
    if (!c.ok) {
      warn(cfg, `company create failed: ${c.status}`);
      return null;
    }
    const j: any = await c.json();
    return j?.data?.id?.record_id ?? null;
  } catch (err) {
    warn(cfg, `company lookup failed: ${(err as Error).message}`);
    return null;
  }
}

export interface PersonInput {
  email: string;
  first_name: string;
  last_name: string;
  job_title?: string;
  company_id?: string | null;
  /** Extra person attribute values keyed by slug, already in Attio value format. */
  extra?: Record<string, unknown>;
}

/** Upsert a person by email. Returns the Attio record id. Throws AttioError on hard failure. */
export async function upsertPerson(cfg: AttioConfig, p: PersonInput): Promise<string> {
  const values: Record<string, unknown> = {
    name: [{ first_name: p.first_name, last_name: p.last_name, full_name: `${p.first_name} ${p.last_name}`.trim() }],
    email_addresses: [{ email_address: p.email }],
    ...(p.extra || {}),
  };
  if (p.job_title) values.job_title = [{ value: p.job_title }];
  if (p.company_id) values.company = [{ target_object: 'companies', target_record_id: p.company_id }];

  const r = await writeWithPrune(cfg, 'person upsert', values, (v) =>
    attioFetch(cfg, '/objects/people/records?matching_attribute=email_addresses', {
      method: 'PUT',
      body: JSON.stringify({ data: { values: v } }),
    }),
  );
  const j: any = await r.json();
  const id = j?.data?.id?.record_id;
  if (!id) throw new AttioError('person upsert: no record_id in response', r.status, '');
  return id;
}

export interface NoteInput {
  parent_object: string;
  parent_record_id: string;
  title: string;
  content: string;
}

export async function createNote(cfg: AttioConfig, n: NoteInput): Promise<void> {
  const r = await attioFetch(cfg, '/notes', {
    method: 'POST',
    body: JSON.stringify({ data: { ...n, format: 'plaintext' } }),
  });
  if (!r.ok) warn(cfg, `note create failed: ${r.status}`);
}

/**
 * Create or update the entry for `parentRecordId` on `list` (slug or id). Attio's assert
 * endpoint updates the existing entry for that parent, or creates one. Returns the entry id,
 * or null when the list is missing or the write fails. Never throws.
 */
export async function upsertListEntry(
  cfg: AttioConfig,
  list: string,
  parentObject: string,
  parentRecordId: string,
  entryValues: Record<string, unknown>,
): Promise<string | null> {
  try {
    const r = await writeWithPrune(cfg, `list entry upsert (${list})`, entryValues, (v) =>
      attioFetch(cfg, `/lists/${encodeURIComponent(list)}/entries`, {
        method: 'PUT',
        body: JSON.stringify({
          data: { parent_record_id: parentRecordId, parent_object: parentObject, entry_values: v },
        }),
      }),
    );
    const j: any = await r.json().catch(() => null);
    return j?.data?.id?.entry_id ?? null;
  } catch (err) {
    const e = err as AttioError;
    if (e.status === 404) warn(cfg, `list ${list} not found; skipping list entry write`);
    else warn(cfg, e.message);
    return null;
  }
}
