/**
 * KV state for the model gate.
 *
 *   ml:<nonce>            {email_hash, issued_at}          TTL LINK_TTL_SECONDS, deleted on use
 *   mlx:<nonce>           {email_hash, issued_at, used_at?} TTL 30 days, tombstone for reuse telemetry
 *   mlcur:<email_hash>    current nonce                     one outstanding link per email
 *   person:<email_hash>   PersonSummary                     no TTL
 *   revoked:<email_hash>  {revoked_at}                      no TTL, delete the key to restore
 *   rl:ip:<ip>            {count, reset_at}                 fixed 1 hour window
 *   rl:em:<email_hash>    {count, reset_at}                 fixed 1 day window
 */

import { STAGES, type Env, type Stage } from './env';

export interface LinkRecord {
  email_hash: string;
  issued_at: number;
  used_at?: number;
}

export interface PersonSummary {
  email: string;
  first_name: string;
  last_name: string;
  persona: string;
  organization: string;
  org_domain: string;
  role: string;
  linkedin?: string;
  attio_person_id?: string;
  stage: Stage;
  request_count: number;
  requested_at?: string;
  verified_at?: string;
  last_viewed_at?: string;
  /** Days (UTC) with at least one successful /me. */
  visit_count: number;
  /** UTC date (YYYY-MM-DD) of the last counted visit. */
  last_visit_day?: string;
  /** Sum of engaged_seconds deltas from page beacons. */
  total_engaged_seconds: number;
  sections_seen: string[];
  final_scenario?: string;
  last_cta?: string;
  request_source?: string;
  utm_source?: string;
  utm_campaign?: string;
}

export const TOMBSTONE_TTL = 30 * 86400;

export async function getPerson(env: Env, emailHash: string): Promise<PersonSummary | null> {
  return env.MODEL_KV.get<PersonSummary>(`person:${emailHash}`, 'json');
}

export async function putPerson(env: Env, emailHash: string, p: PersonSummary): Promise<void> {
  await env.MODEL_KV.put(`person:${emailHash}`, JSON.stringify(p));
}

/** Stages only move forward, except Revoked which always wins. */
export function advanceStage(current: Stage | undefined, next: Stage): Stage {
  if (!current) return next;
  if (current === 'Revoked' || next === 'Revoked') return 'Revoked';
  return STAGES.indexOf(next) > STAGES.indexOf(current) ? next : current;
}

interface Window {
  count: number;
  reset_at: number;
}

/**
 * Fixed-window counter. `peek` reads without counting; `hit` counts one. Returns whether the
 * caller is still within `limit` before this hit.
 */
export async function peekLimit(env: Env, key: string, limit: number, now = Date.now()): Promise<boolean> {
  const w = await env.MODEL_KV.get<Window>(key, 'json');
  if (!w || w.reset_at <= now) return true;
  return w.count < limit;
}

export async function hitLimit(env: Env, key: string, windowSeconds: number, now = Date.now()): Promise<number> {
  const w = await env.MODEL_KV.get<Window>(key, 'json');
  const fresh = !w || w.reset_at <= now;
  const next: Window = fresh ? { count: 1, reset_at: now + windowSeconds * 1000 } : { count: w!.count + 1, reset_at: w!.reset_at };
  // KV needs expiration at least 60 s in the future.
  const expiration = Math.max(Math.ceil(next.reset_at / 1000), Math.ceil(now / 1000) + 61);
  await env.MODEL_KV.put(key, JSON.stringify(next), { expiration });
  return next.count;
}

/** UTC calendar day, YYYY-MM-DD. */
export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}
