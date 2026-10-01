import { useEffect, useRef, useState } from 'react';
import { EMAIL_RE, LEAD_ENDPOINT, getAttribution } from '../../lib/lead';

// Source slug the Worker keys on: a submission tagged `updates` is upserted as an Attio Person AND
// asserted into the "Update Subscribers" list (UPDATES_LIST_SLUG in workers/lead/wrangler.toml).
const SOURCE_SLUG = 'updates';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type FieldName = 'first_name' | 'last_name' | 'email';
type Fields = Record<FieldName, string>;

const EMPTY: Fields = { first_name: '', last_name: '', email: '' };
const REQUIRED: FieldName[] = ['first_name', 'last_name', 'email'];

export default function UpdatesForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState('');
  const csrf = useRef<string | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  async function ensureCsrf() {
    if (csrf.current) return;
    try {
      const r = await fetch(LEAD_ENDPOINT, { method: 'GET' });
      if (r.ok) csrf.current = (await r.json()).csrf_token ?? null;
    } catch {
      /* surfaced on submit */
    }
  }

  // The form IS the page, so fetch the token on mount (the Worker signs it with a 2h TTL) rather
  // than on a trigger click the way the modal does.
  useEffect(() => {
    void ensureCsrf();
  }, []);

  function validateField(name: FieldName, value: string): string {
    if (name === 'first_name' && !value.trim()) return 'First name is required.';
    if (name === 'last_name' && !value.trim()) return 'Last name is required.';
    if (name === 'email') {
      if (!value.trim()) return 'Email is required.';
      if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.';
    }
    return '';
  }

  function onBlur(name: FieldName) {
    const msg = validateField(name, fields[name]);
    setErrors((prev) => ({ ...prev, [name]: msg || undefined }));
  }

  function setField(name: FieldName, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setFormError('');
    const next: Partial<Record<FieldName, string>> = {};
    REQUIRED.forEach((k) => {
      const m = validateField(k, fields[k]);
      if (m) next[k] = m;
    });
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus('submitting');
    await ensureCsrf();
    try {
      const r = await fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          _csrf_token: csrf.current,
          _honeypot: honeypot.current?.value || '',
          _source_slug: SOURCE_SLUG,
          ...getAttribution(),
        }),
      });
      if (r.ok) {
        const attr = getAttribution() as Record<string, string>;
        // Same client-side conversion event the modal fires, keyed on the browser's own distinct_id
        // so the pageview → submit funnel stitches; source_slug separates sign-ups from inquiries.
        try {
          (window as unknown as { posthog?: { capture?: (e: string, p?: Record<string, unknown>) => void } }).posthog?.capture?.(
            'lead_submitted',
            {
              source_slug: SOURCE_SLUG,
              utm_source: attr._utm_source || null,
              utm_medium: attr._utm_medium || null,
              utm_campaign: attr._utm_campaign || null,
              utm_content: attr._utm_content || null,
            },
          );
        } catch {
          /* analytics is non-blocking */
        }
        setStatus('success');
        return;
      }
      const body = await r.json().catch(() => ({}));
      if (body.errors) {
        setErrors(body.errors);
        setStatus('idle');
        setFormError('Please fix the highlighted fields.');
      } else {
        setStatus('error');
        setFormError(body.error || 'Something went wrong. Please email contact@metriasmedical.com.');
      }
    } catch {
      setStatus('error');
      setFormError('We could not reach the server. Please email contact@metriasmedical.com.');
    }
  }

  if (status === 'success') {
    return (
      <div className="py-4 text-center" role="status" aria-live="polite">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-patient-moss/20">
          <svg className="h-6 w-6 text-patient-moss" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
          </svg>
        </div>
        <h2 className="font-heading text-2xl font-bold text-black">You're on the list.</h2>
        <p className="mt-3 font-body text-base text-payer-slate">
          The next Metrias update will come straight to <span className="font-medium text-black">{fields.email}</span>.
        </p>
        <a
          href="/"
          className="mt-6 inline-block rounded-lg bg-provider-blue px-6 py-2.5 font-body text-base font-medium text-white transition-colors hover:bg-provider-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai-gold"
        >
          Back to the site
        </a>
      </div>
    );
  }

  return (
    <>
      <h2 className="font-heading text-xl font-bold text-black md:text-2xl">Sign up</h2>
      <p className="mt-1 font-body text-sm text-payer-slate">Three fields. One email a month. Nothing else.</p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="First name" name="first_name" autoComplete="given-name" required
            value={fields.first_name} error={errors.first_name}
            onChange={(v) => setField('first_name', v)} onBlur={() => onBlur('first_name')}
          />
          <Field
            label="Last name" name="last_name" autoComplete="family-name" required
            value={fields.last_name} error={errors.last_name}
            onChange={(v) => setField('last_name', v)} onBlur={() => onBlur('last_name')}
          />
        </div>
        <Field
          label="Email" name="email" type="email" autoComplete="email" required
          value={fields.email} error={errors.email}
          onChange={(v) => setField('email', v)} onBlur={() => onBlur('email')}
        />

        {/* Honeypot — hidden from users, catches bots (same field name the Worker expects). */}
        <input
          ref={honeypot} type="text" name="company_url" tabIndex={-1} autoComplete="off"
          aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        {formError && <p role="alert" className="font-body text-sm text-bottleneck-red">{formError}</p>}

        <button
          type="submit" disabled={status === 'submitting'}
          className="w-full rounded-lg bg-ai-gold px-6 py-3 font-body text-base font-semibold text-provider-blue transition-colors hover:bg-ai-gold/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-provider-blue disabled:opacity-60"
        >
          {status === 'submitting' ? 'Signing you up…' : 'Sign me up'}
        </button>
        <p className="font-body text-xs text-payer-slate/70">
          By signing up, you agree to our <a href="/privacy" className="underline hover:text-provider-blue">Privacy Policy</a>.
          Reply to any issue to come off the list.
        </p>
      </form>
    </>
  );
}

interface FieldProps {
  label: string;
  name: FieldName;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  error?: string;
  required?: boolean;
  type?: string;
  autoComplete: string;
}

function Field({ label, name, value, onChange, onBlur, error, required, type = 'text', autoComplete }: FieldProps) {
  const id = `updates-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block font-body text-sm font-medium text-black">
        {label}{required && <span className="text-bottleneck-red"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-1.5 w-full rounded-lg border px-3 py-2 font-body text-base text-black outline-none focus:ring-1 ${
          error ? 'border-bottleneck-red focus:border-bottleneck-red focus:ring-bottleneck-red' : 'border-border-gray focus:border-provider-blue focus:ring-provider-blue'
        }`}
      />
      {error && <p id={`${id}-error`} className="mt-1 font-body text-xs text-bottleneck-red">{error}</p>}
    </div>
  );
}
