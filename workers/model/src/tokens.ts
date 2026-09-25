/**
 * Magic-link tokens and session cookies. Both are signed with SESSION_SECRET, with a purpose
 * prefix in the signed message so a link signature can never pass as a cookie signature.
 *
 *   link token      <nonce>.<hmac(SESSION_SECRET, "link." + nonce)>
 *   session cookie  <email_hash>.<issued_at_ms>.<hmac(SESSION_SECRET, "session." + email_hash + "." + issued_at_ms)>
 */

import { constantTimeEqual, hmac, randomHex } from '../../lib/crypto';
import { parseCookies } from '../../lib/http';
import { SESSION_COOKIE, sessionTtlSeconds, type Env } from './env';

const NONCE_RE = /^[0-9a-f]{32}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

export async function signLink(secret: string, nonce: string): Promise<string> {
  return `${nonce}.${await hmac(secret, `link.${nonce}`)}`;
}

export async function issueLinkToken(secret: string): Promise<{ nonce: string; token: string }> {
  const nonce = randomHex(16);
  return { nonce, token: await signLink(secret, nonce) };
}

/** Returns the nonce when the token is well formed and its HMAC verifies, else null. */
export async function verifyLinkToken(secret: string | undefined, token: string | null): Promise<string | null> {
  if (!secret || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [nonce, sig] = parts;
  if (!NONCE_RE.test(nonce)) return null;
  const expected = await hmac(secret, `link.${nonce}`);
  return constantTimeEqual(expected, sig) ? nonce : null;
}

export async function signSession(secret: string, emailHash: string, issuedAt: number): Promise<string> {
  return `${emailHash}.${issuedAt}.${await hmac(secret, `session.${emailHash}.${issuedAt}`)}`;
}

export interface Session {
  email_hash: string;
  issued_at: number;
}

/** Verifies signature and age. Does not check revocation; see getSession. */
export async function verifySessionValue(
  secret: string | undefined,
  value: string | undefined,
  ttlSeconds: number,
  now = Date.now(),
): Promise<Session | null> {
  if (!secret || !value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [emailHash, issuedRaw, sig] = parts;
  if (!HASH_RE.test(emailHash) || !/^\d{1,16}$/.test(issuedRaw)) return null;
  const issuedAt = Number(issuedRaw);
  if (issuedAt > now + 60_000) return null; // from the future beyond clock skew
  if (now - issuedAt > ttlSeconds * 1000) return null;
  const expected = await hmac(secret, `session.${emailHash}.${issuedAt}`);
  if (!constantTimeEqual(expected, sig)) return null;
  return { email_hash: emailHash, issued_at: issuedAt };
}

export function sessionCookieHeader(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function isRevoked(env: Env, emailHash: string): Promise<boolean> {
  return (await env.MODEL_KV.get(`revoked:${emailHash}`)) !== null;
}

/** Valid, unexpired, unrevoked session from the request cookie, or null. */
export async function getSession(request: Request, env: Env): Promise<Session | null> {
  const value = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  const s = await verifySessionValue(env.SESSION_SECRET, value, sessionTtlSeconds(env));
  if (!s) return null;
  if (await isRevoked(env, s.email_hash)) return null;
  return s;
}
