export interface Env {
  MODEL_KV: KVNamespace;
  ASSETS: Fetcher;

  // vars
  POSTHOG_HOST: string;
  ALLOWED_ORIGIN: string;
  EMAIL_FROM: string;
  /** 'resend' sends through Resend; 'log' prints the link to the console (local and tests). */
  EMAIL_TRANSPORT: string;
  LINK_TTL_SECONDS: string;
  SESSION_TTL_SECONDS: string;

  // secrets
  ATTIO_API_TOKEN?: string;
  POSTHOG_API_KEY?: string;
  RESEND_API_KEY?: string;
  CSRF_SECRET?: string;
  SESSION_SECRET?: string;
  ADMIN_TOKEN?: string;
}

export const PERSONAS = ['Investor', 'Hospital operator', 'Advisor', 'Partner', 'Other'] as const;
export type Persona = (typeof PERSONAS)[number];

/** Model Access list in Attio (parent: people). list_id 5c5502ff-1ef1-40e7-92c9-18f874f4209d. */
export const ATTIO_LIST = 'model_access';

export const SESSION_COOKIE = 'mm_model_session';

export const STAGES = ['Requested', 'Verified', 'Viewed', 'Engaged', 'Revoked'] as const;
export type Stage = (typeof STAGES)[number];

export const IP_LIMIT_PER_HOUR = 5;
export const LINKS_PER_EMAIL_PER_DAY = 3;
/** Engaged threshold on total engaged seconds across visits. */
export const ENGAGED_SECONDS = 180;

export function linkTtlSeconds(env: Env): number {
  const n = parseInt(env.LINK_TTL_SECONDS || '900', 10);
  return Number.isFinite(n) && n >= 60 ? n : 900;
}

export function sessionTtlSeconds(env: Env): number {
  const n = parseInt(env.SESSION_TTL_SECONDS || '2592000', 10);
  return Number.isFinite(n) && n > 0 ? n : 2592000;
}
