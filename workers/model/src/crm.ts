/**
 * Attio wiring for the model gate. Every function here logs and continues on failure: the CRM
 * never fails a request.
 */

import { findOrCreateCompany, upsertListEntry, upsertPerson, type AttioConfig } from '../../lib/attio';
import { ATTIO_LIST, type Env } from './env';
import type { PersonSummary } from './store';

function cfg(env: Env): AttioConfig {
  return { token: env.ATTIO_API_TOKEN, log: (m) => console.warn(m) };
}

/** Upsert the Attio person (and company) for this summary. Returns the record id or null. */
export async function syncPerson(env: Env, p: PersonSummary): Promise<string | null> {
  if (!env.ATTIO_API_TOKEN) {
    console.warn('[attio] ATTIO_API_TOKEN not set; skipping person upsert');
    return null;
  }
  try {
    const companyId = await findOrCreateCompany(cfg(env), p.organization);
    const extra: Record<string, unknown> = {};
    if (p.persona) extra.persona_type = [{ value: p.persona }];
    if (p.linkedin) extra.linkedin = [{ value: p.linkedin }];
    return await upsertPerson(cfg(env), {
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      job_title: p.role,
      company_id: companyId,
      extra,
    });
  } catch (err) {
    console.warn(`[attio] person upsert failed: ${(err as Error).message}`);
    return null;
  }
}

/** Resolve the Attio person id, upserting when the summary does not have one yet. */
export async function ensurePersonId(env: Env, p: PersonSummary): Promise<string | null> {
  if (p.attio_person_id) return p.attio_person_id;
  const id = await syncPerson(env, p);
  if (id) p.attio_person_id = id;
  return id;
}

export type EntryField =
  | 'stage'
  | 'requested_at'
  | 'verified_at'
  | 'last_viewed_at'
  | 'visit_count'
  | 'engaged_seconds'
  | 'final_scenario'
  | 'request_source'
  | 'utm_source'
  | 'utm_campaign';

/** Build Model Access entry values from the summary, limited to `fields` that have a value. */
export function entryValues(p: PersonSummary, fields: EntryField[]): Record<string, unknown> {
  const all: Record<EntryField, unknown> = {
    stage: p.stage,
    requested_at: p.requested_at,
    verified_at: p.verified_at,
    last_viewed_at: p.last_viewed_at,
    visit_count: p.visit_count,
    engaged_seconds: p.total_engaged_seconds,
    final_scenario: p.final_scenario,
    request_source: p.request_source,
    utm_source: p.utm_source,
    utm_campaign: p.utm_campaign,
  };
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = all[f];
    if (v !== undefined && v !== null && v !== '') out[f] = v;
  }
  return out;
}

export async function upsertModelAccess(env: Env, personId: string | null, values: Record<string, unknown>): Promise<void> {
  if (!personId || !env.ATTIO_API_TOKEN || !Object.keys(values).length) return;
  await upsertListEntry(cfg(env), ATTIO_LIST, 'people', personId, values);
}
