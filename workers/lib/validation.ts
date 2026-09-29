/**
 * Shared input validation for Metrias Workers.
 *
 * Copied from workers/lead/src/index.ts. Hard rule for every form Worker: collect no PHI.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Small disposable-email blocklist (extend as needed).
export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
  'trashmail.com', 'getnada.com', 'sharklasers.com', 'maildrop.cc', 'dispostable.com',
]);

// Defensive PHI guard: reject obvious patient-data markers in free text.
export const PHI_MARKERS =
  /\b(mrn|medical record (number|no)|date of birth|\bdob\b|ssn|social security|patient name|diagnosis code|icd-?10)\b/i;

export const PHI_ERROR = 'Please do not include patient information. This form is not for PHI.';

/** Trim and length-cap a value; anything that is not a string becomes ''. */
export function clean(s: unknown, max: number): string {
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function emailDomain(email: string): string {
  return (email.split('@')[1] || '').toLowerCase();
}

export function isDisposableEmail(email: string): boolean {
  return DISPOSABLE_DOMAINS.has(emailDomain(email));
}

export function containsPhi(text: string): boolean {
  return PHI_MARKERS.test(text);
}

/**
 * Best-effort MX/A check via Cloudflare DoH, cached 24h in the given KV namespace under
 * `mx:<domain>`. Non-fatal on lookup failure (returns true).
 */
export async function domainHasMail(kv: KVNamespace, email: string): Promise<boolean> {
  const domain = emailDomain(email);
  if (!domain) return false;
  const cacheKey = `mx:${domain}`;
  const cached = await kv.get(cacheKey);
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
    await kv.put(cacheKey, valid ? '1' : '0', { expirationTtl: 86400 });
    return valid;
  } catch {
    return true; // do not block on resolver hiccup
  }
}
