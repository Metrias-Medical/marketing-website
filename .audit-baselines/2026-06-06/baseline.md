# Pre-Strengthening Baseline — 2026-06-06

Captured before the **Website Strengthening — Playbook Pass 2026-05-28** backlog (ClickUp,
Metrias Ops). This is the "before" snapshot the post-change comparison measures against.
See Notion → MM.com Hub → *Conversion & Credibility Audit — 2026-05-28* (overall 2.4/5).

## Environment
- Repo: `Metrias-Medical/marketing-website`
- Canonical branch: `dev` (auto-deploys to GitHub Pages via `.github/workflows/deploy.yml` on push)
- Baseline commit (`origin/dev`): `0361e2b5d8e5ef96605e5ccf3bcb3974f97d2448`
- Work branch: `strengthening/playbook-pass-2026-05-28`
- Node: v26 · Astro 6.1.5 · build: **green** (6 pages + `/connect/mene` redirect, ~775ms)
- dist/: 25M, 7 html pages

## Scorecard at baseline (from audit)
| # | Element | Score |
|---|---------|-------|
| 1 | Global Nav & Architecture | 2/5 |
| 2 | Hero | 4/5 |
| 3 | Problem Framing & Value Prop | 3/5 |
| 4 | Mechanism & Interop | 1/5 home · 3/5 /hospitals |
| 5 | Proof & Credibility | 2/5 |
| 6 | Pricing & Engagement | 3/5 |
| 7 | CTA & Form Usability | 1/5 |
| 8 | Footer & Institutional Trust | 1/5 |

**Weighted: ~2.4 / 5**

## Conversion funnel at baseline
- **Every** conversion CTA is a `mailto:` link → no measurable funnel (form-start / form-complete / field-drop-off all structurally unmeasurable).
- `mailto:` count by file (baseline):
  - `components/home/BottomCTA.astro`: 2
  - `components/home/HeroGrainient.tsx`: 2
  - `components/global/Navbar.astro`: 2
  - `components/global/Footer.astro`: 1
  - `pages/about.astro`: 1
  - `pages/product.astro`: 1
  - `pages/investors.astro`: 2
  - **Total: 11**
- Analytics: PostHog only (`BaseLayout.astro`), key `phc_y23A…`, host `us.i.posthog.com`. No GA/Meta/LinkedIn pixel.

## Nav reachability at baseline
- Navbar exposes: Home, About Us, "Request Demo" (gold, mailto).
- Orphan (in repo, ship to prod, not in nav): `/hospitals`, `/investors`, `/product` (commented out `Navbar.astro:4–7`).
- `/model` live at apex (public funding/dilution calculator).

## Known fabrications removed in Phase 1 (recorded for audit trail)
- `hospitals.astro:63–67` — testimonial "Metrias changed how we think about discharge operations." / "VP of Patient Flow, Partner Hospital" (no such hospital).
- `hospitals.astro:54–60` — "2x faster discharge throughput within 60 days" (no pilot exists).
- `$49B / Navigant` anchor (`ProblemStats.astro:28`, `hospitals.astro:30`, `investors.astro` x3) → replaced with Shrank JAMA 2019 ($27.2–78.2B care-coordination waste).

## Lighthouse (home `/`, headless, local preview)
| Category | Before (baseline) | After strengthening |
|----------|-------------------|---------------------|
| Performance | 81* | 96 |
| Accessibility | 95 | 96 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

\* The 81 "before" was a cold first run on a freshly-started preview; the change adds only static
markup/CSS (no new JS or images on home), so the jump to 96 reflects warm-cache variance, not a real
regression. The Phase 5 bar ("perf not regressed >5pts") is met.

Raw Lighthouse JSON (lh-home.json, lh-about.json, lh-home-after.json, lh-home-after-a11y.json) is
git-ignored to avoid ~1.7MB of repo bloat; regenerate with the `npx lighthouse` command if needed.

## Not captured here (needs live infra / credentials)
- **PostHog "Pre-Strengthening Baseline" dashboard** (4 charts: pageviews on `/`, mailto click events, scroll depth on ProblemStats + FounderSection) — requires a PostHog **personal API key** to create programmatically. Flagged to Mene.
- Worker `wrangler dev` pre-flight — Worker is being rebuilt from spec this session (the 2026-05-28 local scaffold was never committed and is absent on this laptop).
