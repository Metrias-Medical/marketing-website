/**
 * Shared crypto helpers for Metrias Workers.
 *
 * Copied from workers/lead/src/index.ts (hmac, sha256, CSRF scheme) so new Workers can share
 * them. workers/lead still carries its own copy and imports nothing from here yet.
 */

export function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 of `msg` keyed by `secret`, as lowercase hex. */
export async function hmac(secret: string, msg: string): Promise<string> {
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

/** SHA-256 of `msg` as lowercase hex. */
export async function sha256(msg: string): Promise<string> {
  return bufToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg)));
}

/** Length-checked, constant-time string compare (constant in the content, not the length). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Cryptographically random hex string of `bytes` bytes. */
export function randomHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bufToHex(buf.buffer);
}

/** Canonical email hash used as PostHog distinct_id: sha256 of the lowercased, trimmed email. */
export async function emailHash(email: string): Promise<string> {
  return sha256(email.trim().toLowerCase());
}

// ---------- CSRF (stateless, HMAC-signed timestamp; same scheme as workers/lead) ----------

export const CSRF_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function issueCsrf(secret: string, now = Date.now()): Promise<string> {
  const ts = now.toString();
  const sig = await hmac(secret, ts);
  return `${ts}.${sig}`;
}

export async function verifyCsrf(
  secret: string,
  token: string | undefined | null,
  now = Date.now(),
  ttlMs = CSRF_TTL_MS,
): Promise<boolean> {
  if (!secret || !token || typeof token !== 'string' || !token.includes('.')) return false;
  const [ts, sig] = token.split('.');
  const ageOk = Number.isFinite(+ts) && now - +ts < ttlMs && +ts <= now;
  if (!ageOk || !sig) return false;
  const expected = await hmac(secret, ts);
  return constantTimeEqual(expected, sig);
}
