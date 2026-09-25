/**
 * Shared HTTP helpers for Metrias Workers. Copied from workers/lead/src/index.ts and
 * generalized to take the allowed origin instead of the lead Env.
 */

export function corsHeaders(allowedOrigin: string, methods = 'GET, POST, OPTIONS'): Record<string, string> {
  return {
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-methods': methods,
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Parse a Cookie header into a name to value map. */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (name && !(name in out)) out[name] = value;
  }
  return out;
}

/**
 * Read a request body as JSON regardless of content type, so `navigator.sendBeacon` payloads
 * (sent as text/plain or a Blob type) parse the same as fetch JSON. Returns null when the body
 * is not a JSON object.
 */
export async function readJsonBody<T = Record<string, unknown>>(request: Request, maxBytes = 16384): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text || text.length > maxBytes) return null;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}
