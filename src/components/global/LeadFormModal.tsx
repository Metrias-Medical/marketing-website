import { useEffect, useRef, useState } from 'react';

const LEAD_ENDPOINT = '/api/lead';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'submitting' | 'success' | 'error';

interface Fields {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  company: string;
  message: string;
}

const EMPTY: Fields = { first_name: '', last_name: '', email: '', role: '', company: '', message: '' };

// Copy varies by trigger intent (data-lead-intent) so one modal serves hospital, investor,
// and the /mene persona "stay in touch" contexts. Falls back to 'website'.
const COPY: Record<string, { heading: string; subtitle: string; messageLabel: string; submit: string }> = {
  website: {
    heading: 'Request a Workflow Assessment',
    subtitle: "Tell us about your facility and we'll set up a short discharge-workflow assessment.",
    messageLabel: 'What would you like to solve?',
    submit: 'Request Assessment',
  },
  investor: {
    heading: 'Get in touch',
    subtitle: "Tell us a bit about your firm and we'll follow up.",
    messageLabel: 'What would you like to discuss?',
    submit: 'Send',
  },
  mene: {
    heading: 'Stay in touch',
    subtitle: "Scanned my card or found me on LinkedIn? Leave a note and I'll get back to you.",
    messageLabel: "What's on your mind?",
    submit: 'Stay in touch',
  },
};

function getAttribution() {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  return {
    _utm_source: q.get('utm_source') || '',
    _utm_medium: q.get('utm_medium') || '',
    _utm_campaign: q.get('utm_campaign') || '',
    _referrer: window.location.pathname,
  };
}

export default function LeadFormModal() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [formError, setFormError] = useState('');
  const [intent, setIntent] = useState('website');
  const csrf = useRef<string | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const lastFocused = useRef<Element | null>(null);

  async function ensureCsrf() {
    if (csrf.current) return;
    try {
      const r = await fetch(LEAD_ENDPOINT, { method: 'GET' });
      if (r.ok) csrf.current = (await r.json()).csrf_token ?? null;
    } catch {
      /* surfaced on submit */
    }
  }

  function openModal(nextIntent?: string) {
    lastFocused.current = document.activeElement;
    setIntent(nextIntent || 'website');
    setOpen(true);
    void ensureCsrf();
  }

  function closeModal() {
    setOpen(false);
    if (status === 'success') {
      setFields(EMPTY);
      setErrors({});
      setStatus('idle');
    }
    if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
  }

  // Global trigger: any [data-lead-trigger] element opens the form.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const trigger = (e.target as HTMLElement)?.closest('[data-lead-trigger]');
      if (!trigger) return;
      e.preventDefault();
      openModal(trigger.getAttribute('data-lead-intent') || 'website');
    };
    const onOpenEvent = (e: Event) => openModal((e as CustomEvent).detail?.intent);
    document.addEventListener('click', onClick);
    window.addEventListener('open-lead-form', onOpenEvent as EventListener);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('open-lead-form', onOpenEvent as EventListener);
    };
  }, [status]);

  // ESC to close + focus first field on open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => firstFieldRef.current?.focus(), 30);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(t);
    };
  }, [open]);

  function validateField(name: keyof Fields, value: string): string {
    if (name === 'first_name' && !value.trim()) return 'First name is required.';
    if (name === 'last_name' && !value.trim()) return 'Last name is required.';
    if (name === 'email') {
      if (!value.trim()) return 'Email is required.';
      if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.';
    }
    return '';
  }

  function onBlur(name: keyof Fields) {
    const msg = validateField(name, fields[name]);
    setErrors((prev) => ({ ...prev, [name]: msg || undefined }));
  }

  function setField(name: keyof Fields, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setFormError('');
    const next: Partial<Record<keyof Fields, string>> = {};
    (['first_name', 'last_name', 'email'] as (keyof Fields)[]).forEach((k) => {
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
          _source_slug: intent,
          ...getAttribution(),
        }),
      });
      if (r.ok) {
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

  if (!open) return null;

  const copy = COPY[intent] ?? COPY.website;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-form-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl md:p-8"
      >
        <button
          type="button"
          onClick={closeModal}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-2 text-payer-slate transition-colors hover:bg-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-provider-blue"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {status === 'success' ? (
          <div className="py-6 text-center" role="status" aria-live="polite">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-patient-moss/20">
              <svg className="h-6 w-6 text-patient-moss" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
              </svg>
            </div>
            <h2 id="lead-form-title" className="font-heading text-2xl font-bold text-black">
              Thanks — we'll be in touch.
            </h2>
            <p className="mt-3 font-body text-base text-payer-slate">
              We received your request and will reach out within one business day.
            </p>
            <button
              type="button"
              onClick={closeModal}
              className="mt-6 rounded-lg bg-provider-blue px-6 py-2.5 font-body text-base font-medium text-white transition-colors hover:bg-provider-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai-gold"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 id="lead-form-title" className="font-heading text-2xl font-bold text-black md:text-[1.75rem]">
              {copy.heading}
            </h2>
            <p className="mt-2 font-body text-sm text-payer-slate">
              {copy.subtitle}
            </p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="First name" name="first_name" required inputRef={firstFieldRef}
                  value={fields.first_name} error={errors.first_name}
                  onChange={(v) => setField('first_name', v)} onBlur={() => onBlur('first_name')}
                />
                <Field
                  label="Last name" name="last_name" required
                  value={fields.last_name} error={errors.last_name}
                  onChange={(v) => setField('last_name', v)} onBlur={() => onBlur('last_name')}
                />
              </div>
              <Field
                label="Work email" name="email" type="email" required
                value={fields.email} error={errors.email}
                onChange={(v) => setField('email', v)} onBlur={() => onBlur('email')}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role" name="role" value={fields.role} onChange={(v) => setField('role', v)} />
                <Field label="Organization" name="company" value={fields.company} onChange={(v) => setField('company', v)} />
              </div>
              <div>
                <label htmlFor="lead-message" className="block font-body text-sm font-medium text-black">
                  {copy.messageLabel}
                </label>
                <textarea
                  id="lead-message" name="message" rows={3} maxLength={2000}
                  aria-describedby="lead-message-hint"
                  value={fields.message} onChange={(e) => setField('message', e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border-gray px-3 py-2 font-body text-base text-black outline-none focus:border-provider-blue focus:ring-1 focus:ring-provider-blue"
                />
                <p id="lead-message-hint" className="mt-1 font-body text-xs text-payer-slate/70">
                  Please don't include any patient information (PHI).
                </p>
              </div>

              {/* Honeypot — hidden from users, catches bots. */}
              <input
                ref={honeypot} type="text" name="company_url" tabIndex={-1} autoComplete="off"
                aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0"
              />

              {formError && <p role="alert" className="font-body text-sm text-bottleneck-red">{formError}</p>}

              <button
                type="submit" disabled={status === 'submitting'}
                className="w-full rounded-lg bg-ai-gold px-6 py-3 font-body text-base font-semibold text-provider-blue transition-colors hover:bg-ai-gold/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-provider-blue disabled:opacity-60"
              >
                {status === 'submitting' ? 'Sending…' : copy.submit}
              </button>
              <p className="font-body text-xs text-payer-slate/70">
                By submitting, you agree to our <a href="/privacy" className="underline hover:text-provider-blue">Privacy Policy</a>.
              </p>
            </form>
          </>
        )}
      </div>
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
  type?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

function Field({ label, name, value, onChange, onBlur, error, required, type = 'text', inputRef }: FieldProps) {
  return (
    <div>
      <label htmlFor={`lead-${name}`} className="block font-body text-sm font-medium text-black">
        {label}{required && <span className="text-bottleneck-red"> *</span>}
      </label>
      <input
        ref={inputRef}
        id={`lead-${name}`}
        name={name}
        type={type}
        value={value}
        required={required}
        autoComplete={name === 'email' ? 'email' : name === 'first_name' ? 'given-name' : name === 'last_name' ? 'family-name' : 'off'}
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
