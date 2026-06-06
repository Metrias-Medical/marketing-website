# metrias-lead — lead-capture Worker

Cloudflare Worker behind `metriasmedical.com/api/lead`. Implements the
**Lead Capture → Attio Wiring** spec (Notion · MM.com Hub).

Flow: `POST /api/lead` → validate → anti-spam (honeypot · CSRF · IP rate-limit · disposable-email ·
MX check) → upsert Attio Person + log Note → server-side PostHog `lead_captured` → optional notify.
`GET /api/lead` issues a stateless HMAC-signed CSRF token.

**This endpoint collects no PHI.** A defensive marker check rejects obvious patient-data fields.

## Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/lead` | Issue CSRF token `{ csrf_token }` |
| `POST` | `/api/lead` | Submit a lead `{ ok }` / `{ ok:false, errors }` |

## Local dev
```bash
cd workers/lead
npm install
cp .dev.vars.example .dev.vars   # fill with dev values
npm run typecheck
npm run dev                       # http://localhost:8787/api/lead
```

## First-time production setup
```bash
# 1. Auth
wrangler login                    # or export CLOUDFLARE_API_TOKEN=...

# 2. KV namespace → paste the ids into wrangler.toml
wrangler kv namespace create LEADS_KV
wrangler kv namespace create LEADS_KV --preview

# 3. Secrets
op read "op://Metrias/ATTIO_API_TOKEN/credential" | wrangler secret put ATTIO_API_TOKEN
wrangler secret put POSTHOG_API_KEY        # PostHog project key
wrangler secret put CSRF_SECRET            # openssl rand -hex 32
wrangler secret put NOTIFY_WEBHOOK_URL     # optional

# 4. Route: uncomment [[routes]] in wrangler.toml (zone must be on this CF account), then
wrangler deploy
```

## Acceptance (per ClickUp Phase 4)
- Test submission appears in Attio within 30s
- PostHog `lead_captured` event visible; field-level drop-off measurable
- Honeypot filled → 200 (silent drop); bad email → 400 inline; CSRF removed → 403; >5/IP/hr → 429
- Mene notification fires (if `NOTIFY_WEBHOOK_URL` set)
