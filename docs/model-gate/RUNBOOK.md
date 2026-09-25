# Model gate: runbook

How to test, deploy and operate `metrias-model`, the Cloudflare Worker that serves
`https://model.metriasmedical.com` behind an email magic link. The build contract is
`CONTRACT.md`; the design is `SPEC.md`. Nothing in this file has been run against production yet.

All commands run from `workers/model` unless a step says otherwise. Values in angle brackets are
placeholders. Secrets are named here and never written down: keep them in 1Password.

## 0. What gets deployed

- Worker `metrias-model` (`workers/model/src`), custom domain `model.metriasmedical.com`.
- KV namespace bound as `MODEL_KV`.
- Static assets from `workers/model/assets`, built by the page build (`npm run build:model` at the
  repo root). The build emits `request.html` and `index.html` at the assets root, public-safe JS
  and CSS under `_astro/`, and the gated page's JS under `_model/`.
- The gate, with no valid session cookie:
  - `/` serves the `request.html` form in place (no redirect, so the URL people share stays `/`).
  - Served as-is: `/request.html`, `/request`, `/_astro/*`, `/fonts/*`, `/favicon.svg`,
    `/favicon.ico`, `/images/brand/metrias-logo-static-v1.png`.
  - Everything else, including `/index.html` and `/_model/*`: 302 to `/request.html` for browser
    navigations (Accept: text/html), 401 JSON for everything else.
- With a valid cookie every asset is served with `Cache-Control: private, no-store`,
  `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`.

## 1. Prerequisites

- Node 22.18 or later (`node --version`).
- Access to the Cloudflare account that holds the `metriasmedical.com` zone.
- A Resend account (team account, not personal).
- 1Password items for: Attio API token, PostHog project API key, Resend API key.
- The page build merged into the same branch, so `workers/model/assets` can be produced.

## 2. Install and run the tests

```bash
cd workers/model
npm ci
npm test          # vitest on @cloudflare/vitest-pool-workers; Attio, PostHog, Resend are stubbed
npm run typecheck
```

`workers/model/.npmrc` sets `legacy-peer-deps=true`; plain `npm install` crashes in npm 10 without it.

## 3. Cloudflare login

```bash
npx wrangler login     # opens a browser; or export CLOUDFLARE_API_TOKEN for CI
npx wrangler whoami    # confirm the account that owns metriasmedical.com
```

## 4. KV namespace

```bash
npx wrangler kv namespace create MODEL_KV
npx wrangler kv namespace create MODEL_KV --preview
```

Paste the two printed ids into `wrangler.toml` over the placeholder `id` and `preview_id` under
`[[kv_namespaces]]`, and commit that change through a PR. The ids are not secrets.

## 5. Secrets

Set each one with `npx wrangler secret put <NAME>` (the command prompts for the value, so it never
lands in shell history):

| Name | Value |
|---|---|
| `ATTIO_API_TOKEN` | Attio token with read-write on people, companies, lists and list entries |
| `POSTHOG_API_KEY` | PostHog project API key for project 377375 (server-side capture) |
| `RESEND_API_KEY` | Resend API key with sending access to the verified domain |
| `CSRF_SECRET` | new random value: `openssl rand -hex 32` |
| `SESSION_SECRET` | new random value: `openssl rand -hex 32`. Signs links and session cookies |
| `ADMIN_TOKEN` | new random value: `openssl rand -hex 32`. Guards `/api/revoke` and server-to-server `/api/engagement` |

Example with 1Password: `op read "op://Metrias/ATTIO_API_TOKEN/credential" | npx wrangler secret put ATTIO_API_TOKEN`.

Store `SESSION_SECRET` and `ADMIN_TOKEN` in 1Password as new items. Rotating `SESSION_SECRET`
signs everyone out and invalidates outstanding links; that is also the emergency kill switch.

Vars are in `wrangler.toml` (`POSTHOG_HOST`, `ALLOWED_ORIGIN`, `EMAIL_FROM`, `EMAIL_TRANSPORT`,
`LINK_TTL_SECONDS`, `SESSION_TTL_SECONDS`). Production uses `EMAIL_TRANSPORT = "resend"`.

## 6. Resend domain and DNS

The sender is `access@metriasmedical.com` (CONTRACT). Verify the root domain in Resend and set
the custom return path to a dedicated `mail` subdomain, so bounce handling and SPF live on
`mail.metriasmedical.com` and nothing touches the root MX or SPF records used by Google Workspace.

1. Resend dashboard, Domains, Add domain: `metriasmedical.com`, region `us-east-1`.
2. Open the domain's advanced settings and set Custom Return Path to `mail`.
3. Resend then lists the records. Add each in Cloudflare DNS for `metriasmedical.com`, proxy status
   **DNS only** (grey cloud). Copy the values from Resend; the table shows their usual shape.

| Type | Name | Value | Purpose |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=<public key from Resend>` | DKIM, signs as `d=metriasmedical.com` |
| MX | `mail` | `feedback-smtp.us-east-1.amazonses.com`, priority 10 | bounce and complaint feedback |
| TXT | `mail` | `v=spf1 include:amazonses.com ~all` | SPF for the return path |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<dmarc reports mailbox>` | only if no DMARC record exists yet |

4. Check for an existing DMARC record first (`dig +short TXT _dmarc.metriasmedical.com`). If one
   exists, keep it. DKIM on `metriasmedical.com` and SPF on `mail.metriasmedical.com` both align
   with the From domain under relaxed alignment, which is the DMARC default.
5. Press Verify in Resend and wait for all records to show Verified.
6. Create the API key: Resend, API Keys, permission Sending access, domain `metriasmedical.com`.
   Put it in 1Password, then `npx wrangler secret put RESEND_API_KEY`.
7. Send one test through the deployed Worker (step 10) to a Gmail inbox and use Show original to
   confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

## 7. Attio list attributes

The list `Model Access` (api_slug `model_access`, parent people, list_id
`5c5502ff-1ef1-40e7-92c9-18f874f4209d`) already exists. Create its attributes and stage options:

```bash
cd workers/model
ATTIO_API_TOKEN="$(op read 'op://Metrias/ATTIO_API_TOKEN/credential')" npm run attio:setup -- --dry-run
ATTIO_API_TOKEN="$(op read 'op://Metrias/ATTIO_API_TOKEN/credential')" npm run attio:setup
```

The script (`scripts/attio-setup.ts`) is idempotent: it creates only what is missing, never edits
or deletes, and warns when an attribute exists with a different type. It creates `stage` (select:
Requested, Verified, Viewed, Engaged, Revoked), `requested_at`, `verified_at`, `last_viewed_at`
(timestamp), `visit_count`, `engaged_seconds` (number), `final_scenario`, `request_source`,
`utm_source`, `utm_campaign` (text). The token needs list configuration write access.

The Worker also writes people attributes `persona_type` (exists) and `linkedin` (Attio default).
If any attribute is missing at runtime the Worker logs `[attio] ... attribute(s) missing` and
retries without it; a missing list is logged and skipped. No request fails over Attio.

## 8. Build the assets

From the repo root:

```bash
npm ci
npm run build:model
ls workers/model/assets    # expect index.html, request.html, _astro/, _model/
```

Check that no model content leaked into the public bundle directory. This must print nothing:

```bash
grep -rl "FundingModel" workers/model/assets/_astro workers/model/assets/request.html
```

## 9. Local test with the log transport

Create `workers/model/.dev.vars` (gitignored) from `.dev.vars.example`:

- `EMAIL_TRANSPORT=log` so the link prints to the terminal instead of sending.
- `ALLOWED_ORIGIN=http://localhost:8787` so the printed link points at wrangler dev.
- `CSRF_SECRET`, `SESSION_SECRET`, `ADMIN_TOKEN`: fresh `openssl rand -hex 32` values.
- Leave `ATTIO_API_TOKEN`, `POSTHOG_API_KEY` and `RESEND_API_KEY` empty to keep local runs out
  of the CRM and analytics. The Worker logs the skip and carries on.

```bash
npx wrangler dev    # http://localhost:8787, local KV
```

Browser: open `http://localhost:8787`, submit the form, copy the `/auth?t=...` link from the
wrangler output, open it. You land on the model. Use Chrome or Firefox; they accept the `Secure`
cookie on `http://localhost`.

Terminal only:

```bash
T=$(curl -s localhost:8787/api/request | sed 's/.*"csrf_token":"\([^"]*\)".*/\1/')
curl -s localhost:8787/api/request -H 'content-type: application/json' -d "{
  \"first_name\":\"Test\",\"last_name\":\"Viewer\",\"email\":\"<your address>\",
  \"organization\":\"Metrias Medical\",\"role\":\"Test\",\"persona\":\"Other\",
  \"consent\":true,\"_honeypot\":\"\",\"_csrf_token\":\"$T\"}"
# copy the token from the [email:log] line, then:
curl -si "localhost:8787/auth?t=<token>" | grep -i -E '^(location|set-cookie)'
curl -s localhost:8787/me -H 'cookie: mm_model_session=<cookie value>'
```

A second `/auth` call with the same token must answer `location: /?state=expired`.

## 10. Deploy

```bash
cd workers/model
npx wrangler deploy
```

The `[[routes]]` custom domain creates the proxied DNS record and certificate for
`model.metriasmedical.com` on first deploy. The www site on GitHub Pages is untouched.

Smoke test:

```bash
curl -sI https://model.metriasmedical.com/ | head -1                      # 200, the form
curl -s -o /dev/null -w '%{http_code}\n' https://model.metriasmedical.com/index.html   # 401
curl -s -o /dev/null -w '%{http_code}\n' https://model.metriasmedical.com/_model/      # 401
curl -s https://model.metriasmedical.com/api/request                       # {"csrf_token":...}
```

Then request a link with a real inbox you control, open it, and confirm in Attio that the person
appears on Model Access with stage Verified, and in PostHog that `model_access_requested` and
`model_access_verified` arrived. `npx wrangler tail` streams Worker logs while you test.

Rollback: `npx wrangler deployments list`, then `npx wrangler rollback <deployment id>`.

## 11. Revoke a viewer

```bash
curl -s -X POST https://model.metriasmedical.com/api/revoke \
  -H "x-admin-token: $(op read 'op://Metrias/<ADMIN_TOKEN item>/credential')" \
  -H 'content-type: application/json' \
  -d '{"email":"<viewer email>"}'
# {"ok":true,"email_hash":"..."}
```

Effect: KV `revoked:<email_hash>` is set, the viewer's session stops working on the next request,
any outstanding link dies, new requests for that address answer `{ok:true}` but send nothing, and
the Attio entry moves to stage Revoked.

To restore access, delete the key and ask them to request a new link:

```bash
H=$(printf '%s' '<viewer email>' | tr '[:upper:]' '[:lower:]' | shasum -a 256 | cut -d' ' -f1)
npx wrangler kv key delete --binding MODEL_KV --remote "revoked:$H"
```

## 12. PostHog destinations

Both live in PostHog project 377375, Data pipeline, Destinations. Exclude internal traffic by
adding the internal viewers' email hashes (the `distinct_id` of `model_*` events) to the
test-account cohort 252865 and enabling "Filter out internal and test users" on each destination.

### Attio destination (person properties)

The Worker already writes the Model Access list entry. This destination is for person-level
properties on the Attio person record.

1. New destination, template Attio.
2. API key: an Attio token stored as a secret input in PostHog.
3. Email field: `{person.properties.email}`. The Worker sets `email` on the PostHog person when a
   magic link is verified, so only verified viewers match.
4. Filter: event `model_access_verified`, plus `$set` events whose `distinct_id` has a
   `model_visit_count` person property. Add property filter `email is set`.
5. Attribute mapping: map `model_visit_count`, `model_last_seen`, `model_total_engaged_seconds`,
   `model_sections_seen`, `model_final_scenario` to people attributes of the same slug. Create
   those five attributes on the Attio people object first (number, timestamp, number, number,
   text). The setup script does not create people attributes.
6. Test with one event from the destination's test panel, then enable.

### Webhook destination to /api/engagement (backup for blocked beacons)

The page posts engagement directly with `navigator.sendBeacon`. This webhook is a server-side
backup for viewers whose browser blocks the beacon. It carries only page views and CTA clicks,
never `engaged_seconds`, because the Worker sums engaged seconds and a second source would double
count them.

1. New destination, template HTTP Webhook.
2. URL `https://model.metriasmedical.com/api/engagement`, method POST.
3. Headers: `content-type: application/json` and `x-admin-token: <ADMIN_TOKEN>` (store the value
   as a secret input in PostHog).
4. Filters: events `model_page_viewed` and `model_cta_clicked`.
5. Body:

```json
{ "email_hash": "{event.distinct_id}", "cta": "{event.properties.cta}" }
```

For `model_page_viewed` the `cta` property is empty, which the Worker treats as no CTA: the entry
moves to Viewed. A CTA click moves it to Engaged. The Worker answers 404 for an unknown
`email_hash` and 403 for a revoked one.

## 13. Soft launch

There is no feature flag inside the Worker: access is controlled by who receives a link.

1. Deploy (step 10) before the www redirect change ships, and share `model.metriasmedical.com`
   only with the internal cohort.
2. Add internal viewers' email hashes to PostHog cohort 252865 (step 12) so their sessions stay
   out of the funnel.
3. When the model is ready, merge the page PR that points `/model` and `/investors/model` on www
   at the new origin. That is the public launch.

## Reference: KV keys

| Key | Value | Lifetime |
|---|---|---|
| `ml:<nonce>` | `{email_hash, issued_at}` | `LINK_TTL_SECONDS` (900), deleted on use |
| `mlx:<nonce>` | same plus `used_at` | 30 days, feeds `model_link_reuse_attempt` |
| `mlcur:<email_hash>` | current nonce | link TTL; a new request rotates it |
| `person:<email_hash>` | viewer summary used by `/me` and engagement | no TTL |
| `revoked:<email_hash>` | `{revoked_at}` | until deleted |
| `rl:ip:<ip>`, `rl:em:<email_hash>` | `{count, reset_at}` | 1 hour, 1 day |
| `mx:<domain>` | `1` or `0` | 1 day |

Inspect a viewer: `npx wrangler kv key get --binding MODEL_KV --remote "person:<email_hash>"`.
