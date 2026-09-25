# /model gated page: design spec (draft 2026-09-25)

Status: DRAFT for Mene's decisions. Builder target: VPtech.agent, marketing-website repo, branch off `dev`.

## What exists today (verified in the repo and the connected tools)

- Site: Astro 6 static export, deployed to GitHub Pages on push to `dev`. Everything in `dist/` is public, so a gated page cannot live on www.
- `/model` and `/investors/model` currently redirect to `/investors` (funding model taken down 2026-06-06, "to be replaced with valuation indicators").
- `workers/lead`: Cloudflare Worker at lead.metriasmedical.com with KV, CSRF, honeypot, per-IP rate limit, disposable-domain block, MX check, PHI guard, Attio person upsert plus note, server-side PostHog capture, optional LinkedIn CAPI. This is the pattern to extend.
- PostHog project 377375: posthog-js in BaseLayout (person_profiles identified_only), session replay on, heatmaps on, web vitals on, console logs on, dead clicks off, test-account cohort 252865. `data-attr` is the autocapture attribute.
- Attio: people object has `persona_type` (text). Lists: Angel Pipeline (companies), Communications, Consult Aug 2026, Partners, Pilot Pipeline. No list for site-access requests yet.
- No transactional email sender anywhere in the estate. The magic link needs one.

## Architecture (recommended)

1. **Gate lives on a Worker subdomain**: `model.metriasmedical.com`, same Path B as lead. `www.metriasmedical.com/model` becomes an Astro redirect stub to it (replacing the current redirect to /investors). Reason: www is DNS-only GitHub Pages, so no Worker can sit in front of it without moving DNS, and moving DNS touches the live site.
2. **One new Worker, `workers/model`**, copying the lead helpers (CSRF, rate limit, validation, Attio, PostHog) into a shared `workers/lib`. Bindings: `MODEL_KV`, secrets for Attio, PostHog, Resend, cookie signing.
3. **Content served by Worker Static Assets** with `run_worker_first: true`. The model page is built by a second Astro config (`astro.model.config.mjs`, `outDir: workers/model/assets`) so it keeps the site's layout, Tailwind and React islands. Nothing under `/` is served without a valid session cookie; assets included.
4. **Email**: Resend (or Postmark) on `access@metriasmedical.com` with SPF, DKIM and DMARC alignment on a dedicated subdomain (`mail.metriasmedical.com`). Resend webhooks feed `magic_link_delivered`, `magic_link_opened` (pixel), `magic_link_clicked` into PostHog.

## Flow

1. Visitor lands on model.metriasmedical.com with no session: request-access form.
2. Form fields (minimum viable for Attio): first name, last name, work email, organization, role, persona (select: Investor, Hospital operator, Advisor, Partner, Other), optional LinkedIn URL, consent checkbox ("Send me a one-time access link. I understand my activity on the model page is recorded."). Hidden: honeypot, CSRF, first-touch UTMs and referrer (reuse the sessionStorage first-touch logic from LeadFormModal).
3. Worker validates (same rules as lead, plus Cloudflare Turnstile if bots show up), then:
   - Upserts the Attio person by email, sets `job_title`, `persona_type`, company; creates or updates a **Model Access** list entry with stage `Requested`, `requested_at`, `request_source`, first-touch UTMs.
   - Writes KV `ml:<nonce>` = {email_hash, issued_at} with 15-minute TTL. One outstanding link per email; re-requests rotate the nonce.
   - Sends the magic link `https://model.metriasmedical.com/auth?t=<nonce>.<hmac>`.
   - PostHog server capture `model_access_requested` (distinct_id = sha256(email), properties: persona, org domain, utm set, request_count).
4. Click: Worker verifies HMAC and KV nonce, deletes the nonce (single use), sets `mm_model_session` (HttpOnly, Secure, SameSite=Lax, signed, 30 days, bound to email_hash and issued_at), stamps Attio stage `Verified` plus `verified_at`, captures `model_access_verified` (this is the proof the inbox is real), then 302 to `/`.
5. Page: posthog-js calls `identify(email_hash)` with person properties `email`, `persona`, `org_domain` from a `/me` endpoint, so client and server events join on one person. Replay records under the identified person.
6. Expired or missing session: form again with email prefilled, one click to re-send. Revocation: KV `revoked:<email_hash>` checked on every request; set by hand or by an Attio webhook when the list stage changes to `Revoked`.

## Instrumentation on the page

Events (all prefixed `model_`, all carry `section`, `scenario`, `session_visit_n`):
- `model_page_viewed` (pageview plus `entry_via`: magic_link | returning_session).
- `model_section_viewed` via IntersectionObserver at 50 percent visibility, with `section`, `order_seen`, `ms_since_load`.
- `model_section_dwell` on section exit and on pageleave, `dwell_ms` (visibility API pauses the clock when the tab is hidden).
- `model_assumption_changed` (`input`, `from`, `to`), `model_scenario_selected`, `model_tab_opened`, `model_tooltip_opened`, `model_chart_hovered` (throttled).
- `model_cta_clicked` (`cta`: book_call | request_data_room | email_mene), `model_download_clicked`, `model_copy` (text selection copied, length only), `model_print_attempted`.
- `$pageleave` with `capture_pageleave: true`; PostHog adds max scroll depth and engaged time automatically. Enable `capture_dead_clicks` and rage-click detection for this domain.
- `model_link_reuse_attempt` (server): a used or expired token presented again, with IP and UA hash. Forwarded links show up here.

Person properties kept current (server-side and via PostHog): `model_visit_count`, `model_last_seen`, `model_total_engaged_seconds`, `model_sections_seen` (count of distinct), `model_final_scenario` (the last scenario they left on), `model_requested_at`, `model_verified_at`.

## What else the data gives you (beyond dwell and clicks)

- Intent latency: minutes from request to link click, and whether they opened the email at all.
- Return behavior: visits before and after a meeting, gaps between visits, which sections they came back to.
- Their view of the business: the assumptions they changed and the scenario they settled on says what they believe or doubt.
- Organization by email domain, city and region from GeoIP, device and browser, time of day, first-touch channel (LinkedIn, card, email signature, direct).
- Sharing: the same session cookie on a second device or IP, or a reused token, means the link was forwarded.
- Friction: rage clicks, dead clicks, web vitals on the page, console errors, replay of the exact session.
- Funnel: requested, link opened, verified, viewed 60 seconds or more, CTA clicked. Median dwell and drop-off per section become the review metric.

## Attio wiring

- New list **Model Access** (parent: people) with attributes: `stage` (Requested, Verified, Viewed, Engaged, Revoked), `requested_at`, `verified_at`, `last_viewed_at`, `visit_count`, `engaged_seconds`, `final_scenario`, `request_source`, `utm_source`, `utm_campaign`.
- Stage transitions: Worker sets Requested and Verified. PostHog Attio destination (native, filtered to `model_*` events with an email property) updates the person-level properties; a small PostHog webhook destination to `POST /api/engagement` on the Worker moves the list entry to Viewed (first `model_page_viewed`) and Engaged (`model_total_engaged_seconds` over 180 or any CTA click).
- Existing Attio enrichment fills company from the domain, so the form does not need to ask for anything beyond organization name.

## Security and privacy

- No PHI, no patient data: same guard as the lead worker. Model content is investor-sensitive, not regulated.
- `noindex, nofollow` on the gated origin, `Cache-Control: private, no-store`, watermark of the viewer's email on the page and in any download, `Referrer-Policy: no-referrer`.
- Link: 15-minute expiry, single use, HMAC over nonce and email_hash. Session: 30 days, signed, revocable.
- Rate limits: 5 requests per IP per hour, 3 links per email per day.
- Privacy page: add a paragraph on analytics and session recording for the gated page. The consent checkbox covers the rest.
- Exclude Metrias staff by extending the existing test-account cohort with the `model_*` distinct ids of internal emails.

## Decisions for Mene

1. Subdomain: `model.metriasmedical.com` (recommended) versus moving www behind Cloudflare so `/model` is a real path.
2. Email sender: Resend (recommended, simplest with Workers) versus Postmark.
3. Persona options and whether organization is required.
4. Session length: 30 days (recommended) versus per-visit links.
5. Which content is "the model": the retired funding and dilution model, the valuation indicators, or the GTM economics from the assumptions table.

## Build plan (each step is one chip-sized session)

1. Attio list and attributes; Resend domain and DNS; Worker scaffold with KV and secrets; `/auth`, `/me`, request form endpoint; unit tests for token and cookie logic.
2. Second Astro build target for the model page; Worker Static Assets with the gate; `/model` stub on www; deploy to model.metriasmedical.com behind a feature flag so only Mene's cohort sees it.
3. Instrumentation module (`src/lib/modelTelemetry.ts`) plus dashboard "Model page" in PostHog (funnel, dwell by section, assumptions changed, orgs by domain); Attio destination and webhook.
4. End-to-end QA with a throwaway inbox, DMARC report check, replay review, privacy-page update, then open access.
