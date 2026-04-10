# Metrias Medical — Marketing Website Build Brief

**For:** Cursor + Claude Opus  
**From:** UX.agent (Cowork session 2026-04-10)  
**Figma Source:** https://www.figma.com/design/ttpNvmVZuEPBNEiDDtySR6/202604-Metrias-Marketing-Refactor  
**Repo:** github.com/Metrias-Medical/marketing-website  
**Live Branch:** `gh-pages` (NOT main — main is broken)  
**Live URL:** www.metriasmedical.com

---

## Framework & Stack

**Astro** with React islands for interactive components.

- **Astro** — Static-first, ships zero JS by default. Perfect for marketing.
- **React** — Only for interactive islands (Grainient background, hover-expand cards, video player)
- **Tailwind CSS v4** — With `@theme` block for design tokens
- **ReactBits** — `reactbits.dev` components (Grainient background, possibly others). Install via `jsrepo` CLI per their docs.
- **Deployment** — Static export (`astro build`) → push to `gh-pages` branch on GitHub

### Critical Deployment Guardrails

1. **NEVER force-push to `gh-pages`** — this kills the live site. Branch protection deployed 2026-04-10 (force-push blocked, deletions blocked, enforce_admins=true on both `gh-pages` and `main`).
2. **Preserve the `CNAME` file** — must contain `www.metriasmedical.com`. Put it in `public/CNAME`.
3. **The `main` branch is broken** — ignore it entirely. Work from `gh-pages` or create a new `dev` branch and merge to `gh-pages` when ready.
4. **Cert auto-renews** via GitHub/Let's Encrypt. No action needed unless DNS changes.

### MCP Servers to Configure in Cursor

- **Figma MCP** — For pulling design context per section during build
- **ReactBits MCP** — `npm install reactbits-dev-mcp-server` — component docs and code snippets
- **Notion MCP** (optional) — For querying design system tokens in real time

---

## Site Architecture

### Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Home | Conversion hub — problem → proof → solution → credibility → CTA |
| `/hospitals` | For Hospitals | Value prop for hospital administrators |
| `/investors` | For Investors | Growth story for investors (YELLOW tier — vague on metrics, no RED data) |
| `/about` | About Us | Mission, team, impact, LinkedIn embed |
| `/product` | Product & Client Portal | Portal overview + login CTA → links to SENSOCEL webapp |

### Navigation

Global navbar across all pages:
- Logo (left)
- Home | For Hospitals | For Investors | About Us | Product & Portal
- CTA button: "Request Demo" (right, AI_GOLD accent)

Footer on all pages (consistent).

### External Links

- **SENSOCEL webapp** — `app.metriasmedical.com` (or whatever the production URL is — verify before shipping)
- **LinkedIn** — Mene's personal + Metrias company page
- **Video walkthrough** — hosted video (platform TBD — likely YouTube/Vimeo embed or self-hosted)

---

## Design Tokens

### Brand Colors (Confirmed 2026-04-09)

```css
:root {
  /* Primary palette — named for domain semantics */
  --metrias-provider-blue: #253780;
  --metrias-provider-blue-dark: #1D2C66;
  --metrias-ai-gold: #DEAC31;
  --metrias-patient-moss: #738F73;
  --metrias-payer-slate: #454A53;
  --metrias-bottleneck-red: #DC6843;

  /* Neutrals */
  --metrias-white: #FFFFFF;
  --metrias-off-white: #F8FAFC;
  --metrias-light-gray: #F2F2F2;
  --metrias-mid-gray: #E9EBF2;
  --metrias-border-gray: #D9DADC;
  --metrias-black: #020306;

  /* Semantic usage */
  --color-bg-page: var(--metrias-off-white);
  --color-bg-dark: var(--metrias-provider-blue-dark);
  --color-text-primary: var(--metrias-black);
  --color-text-on-dark: var(--metrias-white);
  --color-cta-primary: var(--metrias-ai-gold);
  --color-cta-text: var(--metrias-provider-blue);
  --color-problem-signal: var(--metrias-bottleneck-red);
  --color-organic-accent: var(--metrias-patient-moss);
}
```

### Typography

```css
:root {
  --font-heading: 'DM Sans', system-ui, sans-serif;
  --font-body: 'Manrope', system-ui, sans-serif;
}
```

| Level | Font | Weight | Size (Desktop) | Size (Mobile) |
|-------|------|--------|----------------|---------------|
| Hero Display | DM Sans | Bold (700) | 72px | 44px |
| H1 | DM Sans | Bold (700) | 52px | 40px |
| H2 | DM Sans | Bold (700) | 44px | 32px |
| H3 | DM Sans | Bold (700) | 22px | 18px |
| Body | Manrope | Regular (400) | 18px | 16px |
| Body Small | Manrope | Regular (400) | 16px | 14px |
| Caption / Source | Manrope | Light (300) | 16px | 12px |
| Tag / Label | Manrope | SemiBold (600) | 16px | 16px |
| Button | Manrope | Medium (500) | 16px | 14px |
| Nav Link | Manrope | SemiBold (600) | 16px | 14px |

### Spacing

Follow 8px grid. Key spacings from Figma: 16, 24, 32, 48, 64, 80, 128px section padding.

---

## Page-by-Page Specs

### Home (`/`)

**Figma Desktop Frame:** `10214:66329` (1440×5969)  
**Figma Mobile Frame:** `10214:66328` (375×6531)

#### Section 1: Navbar (`10214:66381`)
- Height: 72px
- Logo left, nav links center, CTA right
- Sticky on scroll, white bg with subtle shadow on scroll

#### Section 2: Hero Header (`10214:66561`)
- **INTERACTION: Grainient background** — ReactBits `<Grainient>` component as absolute-positioned background spanning this section AND the CTA section below (seamless)
- **INTERACTION: Bounce scroll** — subtle bounce animation revealing the top of the CTA section below, hinting there's more content. Implement with CSS `scroll-snap-type: y proximity` or a light scroll-triggered animation.
- Headline: "Discharge bottlenecks end here" — DM Sans Bold 72px, white
- Subtext: Company description — Manrope Regular, white
- Background image: healthcare worker with blue overlay + Grainient layer

**Grainient Configuration:**
```jsx
<Grainient
  color1="#253780"    // PROVIDER_BLUE
  color2="#1D2C66"    // PROVIDER_BLUE_DARK
  color3="#DEAC31"    // AI_GOLD
  grainAmount={0.08}
  contrast={1.3}
  saturation={0.85}
  warpStrength={0.6}
  timeSpeed={0.15}
  warpFrequency={3.0}
/>
```

#### Section 3: CTA Banner (`10214:66617`)
- Grainient background continues from hero (shared container)
- "Solve Hospital Discharge Throughput Now"
- Two buttons: "Contact" (outline) + "Demo" (filled, AI_GOLD)

#### Section 4: Problem Stats (`10214:66682`)
- Background: `--metrias-provider-blue-dark` (#1D2C66)
- Tag: "Problem" — BOTTLENECK_RED (#DC6843)
- Heading: "The $49 billion administrative discharge delay problem" — DM Sans Bold 52px, white
- Three stat cards on navy (#253780) with rounded corners:
  - "6.6" — DM Sans Bold 80px, BOTTLENECK_RED
  - "2 days" — DM Sans Bold 80px, BOTTLENECK_RED
  - "2-3x" — DM Sans Bold 80px, BOTTLENECK_RED
  - Descriptions: DM Sans Bold 22px, white
  - Sources: Manrope Light 16px, white

#### Section 5: How It Works — Expeditor Bandwidth (`10214:66978`)
- Tag: "Solution"
- Heading: "Expeditor bandwidth on demand."
- **INTERACTION: Hover-expand panels** — Two side-by-side panels. Default: 50/50 split. On hover, hovered panel expands to 66%, other shrinks to 34%. Smooth CSS transition (~300ms ease-out) using `flex-grow` or Framer Motion `layout` prop.
  - Left panel: "Real people handling the work that matters" — image card with overlay text
  - Right panel: "AI learns from every action taken" — image card with overlay text

#### Section 6: About / Founder (`10214:67101`)
- "Physician founded, built for Operators"
- Split layout: image left, text right
- Body text describing company philosophy

#### Section 7: Bottom CTA (`10214:67167`)
- "Ready to clear the bottleneck?"
- Two buttons
- Background image (hospital hallway)

#### Section 8: Footer (`10214:67280`)
- Logo, nav links, legal
- Gold accent preserved (we fixed the token)

---

### For Hospitals (`/hospitals`)

**No Figma designs exist yet** — build from Relume sitemap structure using Home page design language.

| Section | Component Pattern | Notes |
|---------|------------------|-------|
| Header | Hero variant (shorter) | Tailored to hospital admins |
| Features List | 3-column cards | Rapid deploy, seamless integration, measurable acceleration |
| Benefits | Icon + stat grid | Beds, LOS, satisfaction |
| Step 1: Embedded Experts | Feature left (image + text) | Full-width alternating layout |
| Step 2: Proprietary Software | Feature right (text + image) | |
| Step 3: AI Automation | Feature left (image + text) | |
| Stats / Case Study | Stats section (reuse Home pattern) | Impact metrics |
| Timeline | Horizontal stepper | 5 stages: Deploy → Software → Manage → AI learns → Automate |
| Testimonials | Quote carousel or cards | |
| FAQ | Accordion | |
| CTA | Full-width banner | "Book a Discovery Call" |

---

### For Investors (`/investors`)

**INFORMATION TIER: YELLOW** — Can reference business model, market size, traction direction. NEVER include specific cap table, valuation, or investor conversation details.

| Section | Component Pattern | Notes |
|---------|------------------|-------|
| Header | Hero variant | Market approach + growth potential |
| Human-Powered Wedge | Feature section | Strategy explanation |
| Software + Data Flywheel | Feature section | Proprietary tech + data moat |
| Traction Metrics | Stats section | Keep YELLOW — directional only |
| Testimonials | Quote cards | Hospital admin quotes |
| Revenue Model | Pricing/model overview | High-level |
| FAQ | Accordion | Scalability, market, competition |
| CTA | Full-width banner | "Request Pitch Deck" |

---

### About Us (`/about`)

| Section | Component Pattern | Notes |
|---------|------------------|-------|
| Header | Hero variant | Mission + Vision |
| Founding Story | Long-form text + image | |
| Team | Profile cards grid | Leadership + key experts |
| Impact Stats | Stats section | |
| Partner Logos | Logo carousel/grid | Hospital partners |
| Job Listings | Cards or list | Open positions |
| CTA | Banner | "Connect with us" |
| LinkedIn Embed | Social feed | Embedded LinkedIn posts — use LinkedIn API or oEmbed |

---

### Product & Client Portal (`/product`)

| Section | Component Pattern | Notes |
|---------|------------------|-------|
| Header | Hero variant | Secure access overview |
| CTA | Split — Login + Request Access | Login → links to SENSOCEL webapp (external) |
| Feature: Dashboard | Feature section | Real-time patient flow |
| Feature: AI Recs | Feature section | Automation + recommendations |
| Feature: Secure Comms | Feature section | Document sharing for care teams |
| FAQ | Accordion | Portal features, security, onboarding |
| **Video Walkthrough** | Video embed section | Hosted video player — placement TBD, likely here or after header |

---

## Interaction Specs Summary

| Interaction | Section | Implementation |
|-------------|---------|----------------|
| Grainient animated background | Hero + CTA (shared) | ReactBits `<Grainient>` as React island in Astro |
| Bounce scroll reveal | Hero → CTA transition | CSS `scroll-snap` or IntersectionObserver + CSS animation |
| Hover-expand panels | Expeditor Bandwidth | CSS `flex-grow` transition on `:hover` with `~` sibling selector |
| Sticky navbar with scroll shadow | All pages | `position: sticky` + IntersectionObserver for shadow class |
| Scroll-triggered fade-in | All content sections | IntersectionObserver + CSS `opacity`/`transform` transitions |
| Video player | Product page | YouTube/Vimeo embed or `<video>` tag with custom controls |
| LinkedIn embed | About page | LinkedIn oEmbed or API-pulled cards |
| FAQ accordion | Multiple pages | Astro `<details>`/`<summary>` (zero JS) or React island |

---

## Folder Structure

```
metrias-marketing/
├── astro.config.mjs
├── tailwind.config.mjs
├── package.json
├── public/
│   ├── CNAME                    # www.metriasmedical.com — DO NOT DELETE
│   ├── fonts/
│   │   ├── DMSans-Bold.woff2
│   │   ├── Manrope-Regular.woff2
│   │   ├── Manrope-Light.woff2
│   │   ├── Manrope-Medium.woff2
│   │   └── Manrope-SemiBold.woff2
│   ├── images/
│   │   ├── hero/
│   │   ├── team/
│   │   ├── partners/
│   │   └── og/                  # Open Graph images per page
│   └── video/                   # If self-hosted
├── src/
│   ├── components/
│   │   ├── global/
│   │   │   ├── Navbar.astro
│   │   │   ├── Footer.astro
│   │   │   └── SEOHead.astro
│   │   ├── home/
│   │   │   ├── HeroGrainient.tsx      # React island
│   │   │   ├── ProblemStats.astro
│   │   │   ├── ExpeditorPanels.tsx    # React island (hover expand)
│   │   │   ├── FounderSection.astro
│   │   │   └── BottomCTA.astro
│   │   ├── shared/
│   │   │   ├── StatsCard.astro
│   │   │   ├── FeatureSection.astro
│   │   │   ├── CTABanner.astro
│   │   │   ├── FAQAccordion.astro
│   │   │   ├── TestimonialCard.astro
│   │   │   └── VideoEmbed.tsx         # React island
│   │   └── about/
│   │       └── LinkedInFeed.tsx       # React island
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── hospitals.astro
│   │   ├── investors.astro
│   │   ├── about.astro
│   │   └── product.astro
│   └── styles/
│       └── global.css               # Tailwind @theme tokens
└── .github/
    └── workflows/
        └── deploy.yml               # Astro build → gh-pages
```

---

## Image Assets

Export from Figma using the Figma MCP `get_design_context` tool for each section. Key images needed:

- Hero background photo (healthcare worker)
- Expeditor panel images (2)
- Founder/About section photo
- Bottom CTA background (hospital hallway)
- Team headshots (About page)
- Partner logos (About page)
- OG images per page (1200×630)

---

## SEO & Meta

Each page needs:
- `<title>` tag (unique per page)
- `<meta name="description">` (unique per page)
- Open Graph tags (`og:title`, `og:description`, `og:image`)
- Twitter Card tags
- Canonical URL
- Schema.org `Organization` markup on Home
- Schema.org `MedicalBusiness` markup (if applicable)

---

## Performance Targets

- Lighthouse Performance: >95
- First Contentful Paint: <1.5s
- Largest Contentful Paint: <2.5s
- Total JS shipped: <50KB (Astro zero-JS default + only React islands)
- Images: WebP/AVIF with `loading="lazy"` for below-fold

---

## Resolved Questions

1. **Video walkthrough** — Needs to be recorded. No recording tools in current stack. See Video Recording section below.
2. **SENSOCEL webapp URL** — `app.metriasmedical.com` (confirmed)
3. **Team photos** — Mene has them. Drop into `assets/team-photos/` in the handoff folder.
4. **Partner logos** — No hospital partners yet. Include: **Mohara**, **AWS**. Use as credibility signals. Drop SVGs/PNGs into `assets/partner-logos/`.
5. **Job listings** — Static content. Stub two roles: **Fractional Ops Consultant** and **Pilot Expeditor**.
6. **LinkedIn embed** — Use LinkedIn API (MCP access available) to pull recent posts dynamically. Fall back to static cards with post screenshots if API rate-limits are an issue.
7. **Analytics** — Keep PostHog + UptimeRobot (both active). No additions needed unless we want heatmaps (PostHog has this built in).

---

## Video Recording — Stack Recommendation

No recording tool exists in the Metrias Tech Stack (Notion DB) or Tool Inventory. Here are options:

### Option A: Loom (Recommended)
- **Why:** Fastest time-to-video. Record screen + camera, auto-generates embed code, tracks viewer engagement, has a free tier. The embed is lightweight and responsive — perfect for the Product page.
- **Cost:** Free for up to 25 videos, Pro is $12.50/mo
- **Embed:** `<iframe>` embed or Loom SDK for custom player
- **BAA:** Loom offers BAA for Enterprise plan. If the walkthrough shows PHI, need Enterprise. If it's a demo with fake data, Free/Pro is fine.

### Option B: Screen Studio (Mac native)
- **Why:** Produces the highest-quality screen recordings with automatic zoom, smooth cursor movement, and export to MP4. You'd self-host or upload to YouTube/Vimeo.
- **Cost:** $89 one-time
- **Embed:** Upload to YouTube (unlisted) and use `<iframe>`, or self-host in `/public/video/`

### Option C: OBS Studio + YouTube
- **Why:** Free, full control, but more setup time. Good if you want to do multiple takes and edit.
- **Cost:** Free
- **Embed:** YouTube `<iframe>` with `nocookie` domain for privacy

**Recommendation:** Record with Screen Studio or OBS for quality, publish to **YouTube** as the hosting platform. YouTube doubles as a future social media channel (Mene confirmed intent to build YouTube presence). Embed on the Product page via YouTube `<iframe>` with `nocookie` domain.

This means the video embed implementation should use YouTube's privacy-enhanced mode:
```html
<iframe src="https://www.youtube-nocookie.com/embed/VIDEO_ID"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
  allowfullscreen>
</iframe>
```

Record with fake/demo patient data — no PHI in a marketing video.

**Action needed:** Record the walkthrough, upload to YouTube (unlisted until site launches, then public), and drop the VIDEO_ID into the Product page component.
