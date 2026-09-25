# Model gate: build contract (binding for all chips)

Decisions taken by Mene on 2026-09-25: build and open PRs only (no deploy, no real email);
gated content = the retired `src/components/investors/FundingModel.tsx` with a Draft banner;
origin `model.metriasmedical.com`; Resend as sender; 30-day session cookie; personas
Investor, Hospital operator, Advisor, Partner, Other; organization required, LinkedIn optional.

## Branches and PRs

- Umbrella branch: `feat/model-gate` (this branch). Sub-branches: `feat/model-gate-worker`,
  `feat/model-gate-page`. Draft PRs from sub-branches target `feat/model-gate`, never `dev`.
- `main` is vestigial. Production deploys from `dev`. Nobody merges to `dev` overnight.
- Never touch `workers/lead/src/index.ts` behavior. Shared code is copied into `workers/lib/`
  and `workers/lead` keeps importing nothing from it until a later PR.
- No secrets in the repo. `.dev.vars.example` lists names only.
- No em-dashes in any text you write (code comments, docs, UI copy).

## Layout

```
workers/lib/                 shared TS helpers (crypto, validation, attio, posthog, http)
workers/model/               the gate Worker (wrangler.toml, src/, test/, assets/ is build output)
workers/model/assets/        gitignored; produced by `npm run build:model`
src/pages-model/index.astro  the gated page source (second Astro build target)
astro.model.config.mjs       second Astro config: srcDir pages override, outDir workers/model/assets, site https://model.metriasmedical.com
src/lib/modelTelemetry.ts    client instrumentation (see Events)
src/components/model/        ModelPage.tsx wrapper, RequestAccessForm.tsx, DraftBanner.astro
docs/model-gate/             SPEC.md, CONTRACT.md, RUNBOOK.md (deploy steps, written by the worker chip)
```

## Worker HTTP surface (workers/model)

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/request` | returns `{csrf_token}` (same HMAC scheme as lead) |
| POST | `/api/request` | body: first_name, last_name, email, organization, role, persona, linkedin?, consent (true), _honeypot, _csrf_token, first-touch fields as in LeadFormModal. Validates, rate-limits (5/IP/hour, 3 links/email/day), upserts Attio person, upserts Model Access list entry stage Requested, stores KV `ml:<nonce>` {email_hash, issued_at} TTL 900 s, sends link via Resend (or logs it when `EMAIL_TRANSPORT=log`), captures `model_access_requested`. Returns `{ok:true}` regardless of whether the email exists (no enumeration). |
| GET | `/auth?t=<nonce>.<hmac>` | verifies HMAC over nonce, loads and deletes KV nonce (single use), sets cookie `mm_model_session` (HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 2592000, value `<email_hash>.<issued_at>.<hmac>`), stamps Attio stage Verified, captures `model_access_verified`, 302 to `/`. Expired or reused token: 302 to `/?state=expired` and capture `model_link_reuse_attempt`. |
| GET | `/me` | requires valid cookie; returns `{email_hash, email, first_name, persona, org_domain, visit_count}`. |
| POST | `/api/engagement` | requires valid cookie; body `{engaged_seconds, sections_seen, final_scenario, cta}`; updates KV person summary and Attio list entry (Viewed on first call, Engaged when engaged_seconds >= 180 or cta set). Accepts `navigator.sendBeacon`. |
| POST | `/api/revoke` | requires header `x-admin-token` = `ADMIN_TOKEN` secret; body `{email}`; sets KV `revoked:<email_hash>`. |
| GET | `/*` | static assets with `run_worker_first = true`. No valid cookie: serve `request.html` (the form) for `/`, 401 JSON for anything else. Valid cookie: serve asset, add `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`. |

`email_hash` = sha256 hex of lowercased trimmed email (same as lead worker's distinct_id).

## Bindings and secrets (names only)

`MODEL_KV` (KV), `ASSETS` (static assets). Vars: `POSTHOG_HOST`, `ALLOWED_ORIGIN=https://model.metriasmedical.com`,
`EMAIL_FROM=access@metriasmedical.com`, `EMAIL_TRANSPORT=resend|log`, `LINK_TTL_SECONDS=900`,
`SESSION_TTL_SECONDS=2592000`. Secrets: `ATTIO_API_TOKEN`, `POSTHOG_API_KEY`, `RESEND_API_KEY`,
`CSRF_SECRET`, `SESSION_SECRET`, `ADMIN_TOKEN`.

## Attio

- People: upsert by `email_addresses`; set `name`, `job_title` (role), `persona_type` (persona), `linkedin` when given; company via findOrCreate on organization name.
- List `Model Access` (api_slug `model_access`, parent people). Entry attributes (created by the orchestrator, slugs fixed): `stage` (select: Requested, Verified, Viewed, Engaged, Revoked), `requested_at`, `verified_at`, `last_viewed_at`, `visit_count`, `engaged_seconds`, `final_scenario`, `request_source`, `utm_source`, `utm_campaign`.
- If the list or an attribute is missing at runtime, log and continue; never fail the request over CRM.

## PostHog events (client unless marked server)

`model_access_requested` (server), `model_access_verified` (server), `model_link_reuse_attempt` (server),
`model_page_viewed` {entry_via}, `model_section_viewed` {section, order_seen, ms_since_load},
`model_section_dwell` {section, dwell_ms}, `model_assumption_changed` {input, from, to},
`model_scenario_selected` {scenario}, `model_tab_opened` {tab}, `model_tooltip_opened` {id},
`model_chart_hovered` {chart} (throttled 1/s), `model_cta_clicked` {cta}, `model_download_clicked` {asset},
`model_copy` {length}, `model_print_attempted`. All client events carry `section` when inside one and `session_visit_n`.
Client init: `posthog.identify(email_hash, {persona, org_domain, first_name})` after `/me` resolves; `capture_pageleave: true`; `capture_dead_clicks: true`.
Person properties set server-side on `/api/engagement`: `model_visit_count`, `model_last_seen`, `model_total_engaged_seconds`, `model_sections_seen`, `model_final_scenario`.

## Page

- `src/pages-model/index.astro` renders `DraftBanner` + `ModelPage` (client:load) which mounts `FundingModel.tsx` unchanged, wrapped in `<section data-model-section="...">` blocks so telemetry can observe them. Watermark the viewer's email (from `/me`) in the banner and as a low-opacity repeated overlay.
- `request.html` (the form) is a second Astro page in the same build, `src/pages-model/request.astro`, using `RequestAccessForm.tsx` (fields per Decisions; copy the CSRF, honeypot and first-touch logic from `LeadFormModal.tsx`).
- `astro.config.mjs` redirect change: `/model` and `/investors/model` go to `https://model.metriasmedical.com/`. This is the only change to the public site.
- `<meta name="robots" content="noindex, nofollow">` on both pages.

## Tests and checks (all must pass before a PR leaves draft-ready state)

- Worker: vitest with `@cloudflare/vitest-pool-workers`: token issue/verify/single-use/expiry, cookie sign/verify/revocation, request validation (honeypot, csrf, disposable domain, PHI guard on free text, consent required), rate limits, gate behavior for `/` and assets with and without cookie, engagement stage transitions with a mocked Attio.
- Page: `npm run build` (public site) still succeeds and emits no `/model` page; `npm run build:model` emits `workers/model/assets/index.html` and `request.html`; `npx astro check` clean for new files.
- `grep -rn $'—' docs/model-gate src/components/model src/lib/modelTelemetry.ts workers/model workers/lib` returns nothing.

## Done means

Draft PR `feat/model-gate` into `dev` with: worker, lib, page, telemetry, second build config, redirect change, RUNBOOK.md (secrets to set, Resend DNS records, wrangler deploy commands, feature-flag cohort steps, Attio destination setup), tests green in CI-equivalent local runs, and a QA report in the PR body. Nothing deployed.
