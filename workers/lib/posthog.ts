/**
 * Server-side PostHog capture. Copied from workers/lead/src/index.ts and generalized to take
 * the event name. Never throws: an analytics gap is acceptable, a failed request is not.
 */

export interface PostHogConfig {
  host: string;
  apiKey: string | undefined;
}

export async function posthogCapture(
  cfg: PostHogConfig,
  event: string,
  distinctId: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  if (!cfg.apiKey || !cfg.host) return;
  try {
    await fetch(`${cfg.host.replace(/\/$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: cfg.apiKey,
        event,
        distinct_id: distinctId,
        properties: props,
      }),
    });
  } catch {
    /* analytics gap acceptable */
  }
}

/** Set person properties without emitting a product event. */
export async function posthogSetPerson(
  cfg: PostHogConfig,
  distinctId: string,
  set: Record<string, unknown>,
): Promise<void> {
  return posthogCapture(cfg, '$set', distinctId, { $set: set });
}
