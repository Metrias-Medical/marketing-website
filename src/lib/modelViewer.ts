// Viewer lookup for the gated model origin. One GET /me per page load, shared by the Draft
// banner script and the ModelPage island (both import this module, so the promise is shared).

export interface ModelViewer {
  email_hash: string;
  email: string;
  first_name: string;
  persona: string;
  org_domain: string;
  visit_count: number;
}

/** Where a visitor without a valid session is sent. */
export const REQUEST_PAGE = '/request.html';

let pending: Promise<ModelViewer | null> | null = null;

/**
 * Resolves the signed-in viewer. On 401 the browser is sent to the request form and the promise
 * never resolves. Resolves null when /me cannot be reached (local dev without the Worker, network
 * failure): the page stays readable because the gate itself is enforced by the Worker.
 */
export function getViewer(): Promise<ModelViewer | null> {
  if (pending) return pending;
  pending = (async () => {
    try {
      const r = await fetch('/me', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (r.status === 401) {
        window.location.replace(REQUEST_PAGE);
        return new Promise<never>(() => {});
      }
      if (!r.ok) return null;
      const body = (await r.json()) as Partial<ModelViewer>;
      if (!body || typeof body.email_hash !== 'string') return null;
      return {
        email_hash: body.email_hash,
        email: String(body.email ?? ''),
        first_name: String(body.first_name ?? ''),
        persona: String(body.persona ?? ''),
        org_domain: String(body.org_domain ?? ''),
        visit_count: Number(body.visit_count) || 1,
      };
    } catch {
      return null;
    }
  })();
  return pending;
}
