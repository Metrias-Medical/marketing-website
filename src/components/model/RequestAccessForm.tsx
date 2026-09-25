import { useEffect, useRef, useState } from 'react';

// Same-origin Worker endpoint on model.metriasmedical.com: GET returns {csrf_token}, POST takes the
// request (docs/model-gate/CONTRACT.md). Always answers {ok:true} for a well-formed request, so
// the success copy never says whether the address is known.
const ENDPOINT = '/api/request';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_AFTER_SECONDS = 60;
const PREFILL_KEY = 'mm_model_request';

export const PERSONAS = ['Investor', 'Hospital operator', 'Advisor', 'Partner', 'Other'] as const;
export const CONSENT_TEXT =
  'Send me a one-time access link. I understand my activity on the model page is recorded.';

type Status = 'idle' | 'submitting' | 'success' | 'error';

interface Fields {
  first_name: string;
  last_name: string;
  email: string;
  organization: string;
  role: string;
  persona: string;
  linkedin: string;
}
type FieldName = keyof Fields | 'consent';

const EMPTY: Fields = { first_name: '', last_name: '', email: '', organization: '', role: '', persona: '', linkedin: '' };

// First-touch attribution, copied from src/components/global/LeadFormModal.tsx so both forms
// stamp the same fields. UTM params live on the LANDING url, so the first-seen set is persisted to
// sessionStorage on first load and reused at submit time.
const ATTRIB_KEY = 'mm_first_touch';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

function captureFirstTouch() {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(ATTRIB_KEY)) return; // first touch wins
    const q = new URLSearchParams(window.location.search);
    const hasUtm = UTM_KEYS.some((k) => q.get(k));
    const referrer = document.referrer || '';
    // Only lock in a first-touch when there's a real signal (a UTM or an external referrer), so a
    // plain direct visit doesn't pin an empty record and mask a later UTM'd entry in the same tab.
    if (!hasUtm && !referrer) return;
    sessionStorage.setItem(
      ATTRIB_KEY,
      JSON.stringify({
        utm_source: q.get('utm_source') || '',
        utm_medium: q.get('utm_medium') || '',
        utm_campaign: q.get('utm_campaign') || '',
        utm_content: q.get('utm_content') || '',
        landing_path: window.location.pathname,
        referrer,
      }),
    );
  } catch {
    /* sessionStorage blocked (private mode): fall back to the live URL at submit time */
  }
}

function getAttribution() {
  if (typeof window === 'undefined') return {};
  let ft: Record<string, string> = {};
  try {
    ft = JSON.parse(sessionStorage.getItem(ATTRIB_KEY) || '{}');
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams(window.location.search);
  const pick = (k: string) => ft[k] || q.get(k) || '';
  return {
    _utm_source: pick('utm_source'),
    _utm_medium: pick('utm_medium'),
    _utm_campaign: pick('utm_campaign'),
    _utm_content: pick('utm_content'),
    _referrer: window.location.pathname,
    _ext_referrer: ft.referrer || (typeof document !== 'undefined' ? document.referrer : ''),
  };
}

/** Accepts linkedin.com URLs with or without the scheme; returns '' for anything else. */
export function normalizeLinkedIn(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    const host = u.hostname.toLowerCase();
    if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return '';
    u.protocol = 'https:';
    return u.toString();
  } catch {
    return '';
  }
}

function validateField(name: FieldName, fields: Fields, consent: boolean): string {
  switch (name) {
    case 'first_name':
      return fields.first_name.trim() ? '' : 'First name is required.';
    case 'last_name':
      return fields.last_name.trim() ? '' : 'Last name is required.';
    case 'email':
      if (!fields.email.trim()) return 'Work email is required.';
      return EMAIL_RE.test(fields.email.trim()) ? '' : 'Enter a valid email address.';
    case 'organization':
      return fields.organization.trim() ? '' : 'Organization is required.';
    case 'role':
      return fields.role.trim() ? '' : 'Role is required.';
    case 'persona':
      return (PERSONAS as readonly string[]).includes(fields.persona) ? '' : 'Choose the option that fits best.';
    case 'linkedin':
      return !fields.linkedin.trim() || normalizeLinkedIn(fields.linkedin) ? '' : 'Enter a linkedin.com profile URL, or leave it blank.';
    case 'consent':
      return consent ? '' : 'Tick the box so we can send the link.';
  }
}

const VALIDATED: FieldName[] = ['first_name', 'last_name', 'email', 'organization', 'role', 'persona', 'linkedin', 'consent'];

function loadPrefill(): Fields {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFILL_KEY) || 'null') as Partial<Fields> | null;
    if (saved && typeof saved === 'object') {
      const out = { ...EMPTY };
      (Object.keys(EMPTY) as (keyof Fields)[]).forEach((k) => {
        if (typeof saved[k] === 'string') out[k] = saved[k] as string;
      });
      return out;
    }
  } catch {
    /* storage blocked */
  }
  return EMPTY;
}

export default function RequestAccessForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState('');
  const [expired, setExpired] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_AFTER_SECONDS);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const csrf = useRef<string | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastPayload = useRef<Record<string, unknown> | null>(null);

  async function ensureCsrf() {
    if (csrf.current) return;
    try {
      const r = await fetch(ENDPOINT, { method: 'GET', credentials: 'same-origin' });
      if (r.ok) csrf.current = (await r.json()).csrf_token ?? null;
    } catch {
      /* surfaced on submit */
    }
  }

  useEffect(() => {
    captureFirstTouch();
    void ensureCsrf();
    // Returning visitor (expired session or used link): prefill what they typed last time.
    setFields(loadPrefill());
    const state = new URLSearchParams(window.location.search).get('state');
    if (state === 'expired') setExpired(true);
  }, []);

  // Re-send countdown while the success state is showing.
  useEffect(() => {
    if (status !== 'success' || resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [status, resendIn]);

  useEffect(() => {
    if (status === 'success') successHeadingRef.current?.focus();
  }, [status]);

  function setField(name: keyof Fields, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function onBlur(name: FieldName) {
    const msg = validateField(name, fields, consent);
    setErrors((prev) => ({ ...prev, [name]: msg || undefined }));
  }

  async function post(payload: Record<string, unknown>): Promise<{ ok: true } | { ok: false; body: Record<string, unknown>; status: number }> {
    await ensureCsrf();
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, _csrf_token: csrf.current }),
    });
    if (r.ok) return { ok: true };
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, body, status: r.status };
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setFormError('');
    const next: Partial<Record<FieldName, string>> = {};
    VALIDATED.forEach((k) => {
      const m = validateField(k, fields, consent);
      if (m) next[k] = m;
    });
    setErrors(next);
    if (Object.keys(next).length) {
      setFormError('Please fix the highlighted fields.');
      return;
    }

    const linkedin = normalizeLinkedIn(fields.linkedin);
    const payload: Record<string, unknown> = {
      first_name: fields.first_name.trim(),
      last_name: fields.last_name.trim(),
      email: fields.email.trim(),
      organization: fields.organization.trim(),
      role: fields.role.trim(),
      persona: fields.persona,
      ...(linkedin ? { linkedin } : {}),
      consent: true,
      _honeypot: honeypot.current?.value || '',
      ...getAttribution(),
    };

    setStatus('submitting');
    try {
      const res = await post(payload);
      if (res.ok) {
        lastPayload.current = payload;
        try {
          localStorage.setItem(PREFILL_KEY, JSON.stringify({ ...fields, linkedin }));
        } catch {
          /* storage blocked */
        }
        setResendIn(RESEND_AFTER_SECONDS);
        setResendState('idle');
        setStatus('success');
        return;
      }
      // A rejected CSRF token is single-shot; fetch a fresh one for the next attempt.
      csrf.current = null;
      if (res.body.errors && typeof res.body.errors === 'object') {
        setErrors(res.body.errors as Partial<Record<FieldName, string>>);
        setStatus('idle');
        setFormError('Please fix the highlighted fields.');
      } else if (res.status === 429) {
        setStatus('error');
        setFormError('Too many requests from this network or address. Please try again in an hour.');
      } else {
        setStatus('error');
        setFormError(
          typeof res.body.error === 'string'
            ? res.body.error
            : 'Something went wrong. Please email contact@metriasmedical.com.',
        );
      }
    } catch {
      setStatus('error');
      setFormError('We could not reach the server. Please email contact@metriasmedical.com.');
    }
  }

  async function onResend() {
    if (!lastPayload.current || resendIn > 0 || resendState === 'sending') return;
    setResendState('sending');
    csrf.current = null;
    try {
      const res = await post(lastPayload.current);
      setResendState(res.ok ? 'sent' : 'error');
    } catch {
      setResendState('error');
    }
    setResendIn(RESEND_AFTER_SECONDS);
  }

  function startOver() {
    setStatus('idle');
    setResendState('idle');
    setTimeout(() => firstFieldRef.current?.focus(), 30);
  }

  const card = 'rounded-2xl bg-white p-6 shadow-2xl md:p-8';

  if (status === 'success') {
    return (
      <div className={`${card} text-center`} role="status" aria-live="polite">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-patient-moss/20">
          <svg className="h-6 w-6 text-patient-moss" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
          </svg>
        </div>
        <h2 ref={successHeadingRef} tabIndex={-1} className="font-heading text-2xl font-bold text-black outline-none md:text-[1.75rem]">
          Check your inbox
        </h2>
        <p className="mt-3 font-body text-base text-payer-slate">
          If <strong className="text-black">{fields.email.trim()}</strong> can receive the link, it is on its way.
          Open it on this device within 15 minutes; it works once.
        </p>
        <p className="mt-2 font-body text-sm text-payer-slate/80">
          Nothing after a few minutes? Check spam or promotions, then send it again.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onResend}
            disabled={resendIn > 0 || resendState === 'sending'}
            className="rounded-lg bg-provider-blue px-6 py-2.5 font-body text-base font-medium text-white transition-colors hover:bg-provider-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendState === 'sending'
              ? 'Sending…'
              : resendIn > 0
                ? `Send it again in ${resendIn}s`
                : 'Send the link again'}
          </button>
          {resendState === 'sent' && <p className="font-body text-sm text-patient-moss">Sent again.</p>}
          {resendState === 'error' && (
            <p role="alert" className="font-body text-sm text-bottleneck-red">
              That did not go through. Please try again shortly.
            </p>
          )}
          <button
            type="button"
            onClick={startOver}
            className="font-body text-sm text-payer-slate underline hover:text-provider-blue"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={card}>
      <h2 className="font-heading text-2xl font-bold text-black md:text-[1.75rem]">Request access</h2>
      <p className="mt-2 font-body text-sm text-payer-slate">All fields are required unless marked optional.</p>

      {expired && (
        <div role="status" className="mt-5 rounded-lg border border-ai-gold/50 bg-ai-gold/10 px-4 py-3 font-body text-sm text-black">
          <strong className="font-semibold">That link has expired or was already used.</strong> Access links work once
          and expire after 15 minutes. Request a fresh one below.
        </div>
      )}

      <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="First name" name="first_name" required inputRef={firstFieldRef} autoComplete="given-name"
            value={fields.first_name} error={errors.first_name}
            onChange={(v) => setField('first_name', v)} onBlur={() => onBlur('first_name')}
          />
          <Field
            label="Last name" name="last_name" required autoComplete="family-name"
            value={fields.last_name} error={errors.last_name}
            onChange={(v) => setField('last_name', v)} onBlur={() => onBlur('last_name')}
          />
        </div>
        <Field
          label="Work email" name="email" type="email" required autoComplete="email"
          value={fields.email} error={errors.email}
          onChange={(v) => setField('email', v)} onBlur={() => onBlur('email')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Organization" name="organization" required autoComplete="organization"
            value={fields.organization} error={errors.organization}
            onChange={(v) => setField('organization', v)} onBlur={() => onBlur('organization')}
          />
          <Field
            label="Role" name="role" required autoComplete="organization-title"
            value={fields.role} error={errors.role}
            onChange={(v) => setField('role', v)} onBlur={() => onBlur('role')}
          />
        </div>
        <div>
          <label htmlFor="model-persona" className="block font-body text-sm font-medium text-black">
            I am a<span className="text-bottleneck-red"> *</span>
          </label>
          <select
            id="model-persona"
            name="persona"
            required
            value={fields.persona}
            onChange={(e) => setField('persona', e.target.value)}
            onBlur={() => onBlur('persona')}
            aria-invalid={errors.persona ? 'true' : undefined}
            aria-describedby={errors.persona ? 'error-persona' : undefined}
            className={`mt-1.5 w-full rounded-lg border bg-white px-3 py-2 font-body text-base text-black outline-none focus:ring-1 ${
              errors.persona
                ? 'border-bottleneck-red focus:border-bottleneck-red focus:ring-bottleneck-red'
                : 'border-border-gray focus:border-provider-blue focus:ring-provider-blue'
            }`}
          >
            <option value="" disabled>
              Choose one
            </option>
            {PERSONAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {errors.persona && <p id="error-persona" className="mt-1 font-body text-xs text-bottleneck-red">{errors.persona}</p>}
        </div>
        <Field
          label="LinkedIn profile URL" name="linkedin" type="url" optional autoComplete="url"
          placeholder="linkedin.com/in/yourname"
          value={fields.linkedin} error={errors.linkedin}
          onChange={(v) => setField('linkedin', v)} onBlur={() => onBlur('linkedin')}
        />

        <div>
          <label className="flex items-start gap-3 font-body text-sm text-black">
            <input
              type="checkbox"
              name="consent"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (errors.consent) setErrors((prev) => ({ ...prev, consent: undefined }));
              }}
              aria-invalid={errors.consent ? 'true' : undefined}
              aria-describedby={errors.consent ? 'error-consent' : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 accent-provider-blue"
            />
            <span>{CONSENT_TEXT}</span>
          </label>
          {errors.consent && <p id="error-consent" className="mt-1 font-body text-xs text-bottleneck-red">{errors.consent}</p>}
        </div>

        {/* Honeypot: hidden from people, filled in by bots. */}
        <input
          ref={honeypot} type="text" name="company_url" tabIndex={-1} autoComplete="off"
          aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        {formError && <p role="alert" className="font-body text-sm text-bottleneck-red">{formError}</p>}

        <button
          type="submit" disabled={status === 'submitting'}
          className="w-full rounded-lg bg-ai-gold px-6 py-3 font-body text-base font-semibold text-provider-blue transition-colors hover:bg-ai-gold/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-provider-blue disabled:opacity-60"
        >
          {status === 'submitting' ? 'Sending…' : 'Email me an access link'}
        </button>
        <p className="font-body text-xs text-payer-slate/70">
          By submitting, you agree to our{' '}
          <a href="https://www.metriasmedical.com/privacy" className="underline hover:text-provider-blue">Privacy Policy</a>.
        </p>
      </form>
    </div>
  );
}

interface FieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  required?: boolean;
  optional?: boolean;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

function Field({ label, name, value, onChange, onBlur, error, required, optional, type = 'text', autoComplete = 'off', placeholder, inputRef }: FieldProps) {
  return (
    <div>
      <label htmlFor={`model-${name}`} className="block font-body text-sm font-medium text-black">
        {label}
        {required && <span className="text-bottleneck-red"> *</span>}
        {optional && <span className="font-normal text-payer-slate"> (optional)</span>}
      </label>
      <input
        ref={inputRef}
        id={`model-${name}`}
        name={name}
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `error-${name}` : undefined}
        className={`mt-1.5 w-full rounded-lg border px-3 py-2 font-body text-base text-black outline-none focus:ring-1 ${
          error ? 'border-bottleneck-red focus:border-bottleneck-red focus:ring-bottleneck-red' : 'border-border-gray focus:border-provider-blue focus:ring-provider-blue'
        }`}
      />
      {error && <p id={`error-${name}`} className="mt-1 font-body text-xs text-bottleneck-red">{error}</p>}
    </div>
  );
}
