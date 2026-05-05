# Metrias Marketing Website — Inner Page Wireframe Specs

**Author:** UX.agent  
**Date:** 2026-04-10  
**Status:** L1 Draft — Mene review required before handoff to Dev.agent  
**Design Language:** Extends Home page patterns established in PR #1

---

## Global Standards (Apply to ALL Inner Pages)

### Type Scale (add to @theme in global.css)

```css
@theme {
  --text-display: 4.5rem;    /* 72px — hero headlines only */
  --text-h1: 3rem;           /* 48px — page title */
  --text-h2: 2.25rem;        /* 36px — section headings */
  --text-h3: 1.75rem;        /* 28px — subsection headings */
  --text-h4: 1.25rem;        /* 20px — card titles */
  --text-body: 1.125rem;     /* 18px — paragraph text */
  --text-body-sm: 1rem;      /* 16px — secondary text */
  --text-small: 0.875rem;    /* 14px — captions, labels */
  --text-xs: 0.75rem;        /* 12px — badges, legal */
}
```

### Section Spacing Rhythm

```css
@theme {
  --section-gap-lg: 6rem;    /* 96px — between major page sections (desktop) */
  --section-gap-md: 4rem;    /* 64px — between major sections (mobile) */
  --section-pad-x: 1.5rem;   /* 24px — container horizontal padding (mobile) */
  --section-pad-x-lg: 4rem;  /* 64px — container horizontal padding (desktop) */
  --content-max-w: 72rem;    /* 1152px — max content width */
}
```

All sections use `py-24 lg:py-32` (section-gap-lg) by default. Container: `max-w-7xl mx-auto px-6 lg:px-16`.

### Shared Components (Reuse from Home)

| Component | Source | Reuse Pattern |
|-----------|--------|---------------|
| Navbar | `global/Navbar.astro` | As-is, active link highlight based on current page |
| Footer | `global/Footer.astro` | As-is |
| BaseLayout | `layouts/BaseLayout.astro` | As-is, pass unique title/description per page |
| SEOHead | `global/SEOHead.astro` | As-is, unique OG image per page |
| BottomCTA | `home/BottomCTA.astro` | Reuse with configurable heading/subtext props |

### New Shared Components Needed

| Component | Purpose |
|-----------|---------|
| `global/PageHero.astro` | Standard inner page hero — no Grainient, solid PROVIDER_BLUE_DARK bg, left-aligned heading + subtitle + optional badge |
| `global/SplitSection.astro` | 50/50 or 60/40 image-text split, reversible, with slot for content |
| `global/StatCard.astro` | Reusable stat card (value + label + optional source) from ProblemStats |
| `global/TestimonialCard.astro` | Quote + name + title + optional avatar, bordered card |
| `global/FeatureGrid.astro` | 2x2 or 3x3 icon + title + description grid |
| `global/AccordionFAQ.tsx` | React island, click-to-expand FAQ items, one-open-at-a-time |

### Accessibility Fixes (Apply Globally)

1. **Add skip-to-content link** in BaseLayout before Navbar: `<a href="#main-content" class="sr-only focus:not-sr-only ...">Skip to content</a>` and add `id="main-content"` to `<main>`.
2. **Add Manrope Bold (700)** woff2 font-face to global.css for completeness.
3. **ExpeditorPanels mobile fallback:** Show description text always-visible on screens below `md` breakpoint (remove hover dependency).

---

## Page 1: For Hospitals (`/hospitals`)

**Goal:** Convert hospital COOs, CNOs, and VPs of Patient Flow. Sell the outcome (faster discharges, revenue recovery, staff relief) not the tech.

**Audience mental model:** "Prove this works, show me the ROI, make it easy to say yes."

### Section-by-Section Spec

#### 1.1 PageHero
- **Badge:** "For Hospitals" (PATIENT_MOSS bg, white text)
- **Heading:** "Discharge delays are costing you millions. We fix that." (text-h1, white)
- **Subtitle:** "Metrias deploys remote discharge expeditors backed by AI — reducing excess length of stay, recovering lost revenue, and freeing your clinical staff." (text-body, white/80)
- **CTA:** "See How It Works" → scrolls to section 1.3
- **BG:** PROVIDER_BLUE_DARK solid

#### 1.2 Problem Stats (reuse StatCard grid)
- **Layout:** 3-column grid on dark bg (same pattern as Home ProblemStats)
- **Stats:**
  - "$49B" / "Annual cost of discharge delays in the US" / source: Navigant
  - "6.6 hrs" / "Average discharge delay per patient" / source: Bai et al. 2019
  - "38%" / "Of delays are administrative, not clinical" / source: Rojas-Garcia et al. 2018
- **BG:** OFF_WHITE
- **Stat value color:** BOTTLENECK_RED

#### 1.3 How It Works (3-step flow)
- **Layout:** Horizontal 3-step process with connecting line/arrows
- **Steps:**
  1. Icon: 📋 | "We embed" | "Remote discharge expeditors integrate into your EHR and rounding workflows — no onsite FTEs required."
  2. Icon: ⚡ | "AI accelerates" | "Our platform learns from every discharge, identifies bottlenecks in real-time, and prioritizes the highest-impact actions."
  3. Icon: 📈 | "You see results" | "Reduced LOS, faster throughput, recovered revenue — measurable within the first 30 days."
- **Design:** Each step is a card with number badge (1/2/3 in PROVIDER_BLUE circle), icon, title (text-h4, DM Sans), description (text-body-sm, Manrope). Connected by a thin line (BORDER_GRAY) between cards.
- **BG:** OFF_WHITE
- **Mobile:** Stack vertically, line becomes vertical

#### 1.4 Results / Social Proof
- **Layout:** SplitSection — left: large stat callout, right: testimonial
- **Left side:** Large "2x" in PROVIDER_BLUE (text-display size) + "Faster discharge throughput within 60 days" below
- **Right side:** TestimonialCard — placeholder quote: "Metrias changed how we think about discharge operations." — VP of Patient Flow, [Partner Hospital]
- **BG:** LIGHT_GRAY (#F2F2F2)

#### 1.5 What You Get (FeatureGrid 2x2)
- **Heading:** "What your team gets"
- **Grid items:**
  1. "Dedicated Expeditors" — Remote discharge specialists trained on your protocols
  2. "Real-Time Dashboard" — Live bottleneck visibility across all units
  3. "EHR Integration" — Works with Epic, Cerner, Meditech — no IT project required
  4. "Monthly ROI Reports" — Transparent metrics showing financial and operational impact
- **Design:** Each card: icon (simple SVG or emoji), title (text-h4, DM Sans), 2-line description (text-body-sm). Cards have subtle border (BORDER_GRAY), rounded-xl, hover: slight shadow lift
- **BG:** WHITE

#### 1.6 BottomCTA (reuse)
- **Heading:** "Ready to clear the bottleneck?"
- **Subtitle:** "Schedule a 15-minute call to see projected ROI for your facility."
- **Buttons:** "Contact Us" (outline) + "Request Demo" (AI_GOLD solid)

### Page-Level Notes
- SEO title: "For Hospitals — Clear Discharge Bottlenecks | Metrias Medical"
- OG image: Custom — stat overlay on clinical imagery (needs design)
- Schema.org: Service type markup

---

## Page 2: For Investors (`/investors`)

**Goal:** Convince healthcare investors, angels, and VCs that Metrias is a compelling opportunity. Lead with market size, traction, and team credibility.

**Audience mental model:** "Show me the market, the traction, the team, and why now."

**Data firewall:** GREEN tier only. No cap table, valuation, or round details. Link to data room for detailed financials.

### Section-by-Section Spec

#### 2.1 PageHero
- **Badge:** "For Investors" (AI_GOLD bg, BLACK text)
- **Heading:** "The $49B discharge delay problem has a solution." (text-h1, white)
- **Subtitle:** "Metrias Medical is building the operating system for hospital discharge operations — starting with remote expeditors powered by AI." (text-body, white/80)
- **CTA:** "Request Data Room Access" → mailto or Calendly
- **BG:** PROVIDER_BLUE_DARK

#### 2.2 Market Opportunity (stat row)
- **Layout:** 3 stats in a row, light bg
- **Stats:**
  - "$49B" / "Annual addressable market" / "Administrative discharge delays in US hospitals"
  - "6,000+" / "US hospitals" / "Potential customers with 100+ beds"
  - "0" / "Scaled competitors" / "No one owns this workflow at scale"
- **Stat value color:** PROVIDER_BLUE
- **BG:** OFF_WHITE

#### 2.3 Why Now (SplitSection)
- **Layout:** Left text, right: simple timeline or Mermaid-rendered visual
- **Heading:** "Three forces converging"
- **Content (3 items, NOT a bullet list — use numbered blocks):**
  1. **Staffing crisis** — Hospitals can't hire enough case managers. Remote expeditors solve the labor gap.
  2. **AI inflection** — LLMs can now parse clinical documentation and recommend next-best-action in discharge workflows.
  3. **Value-based care pressure** — CMS penalties for readmissions and excess LOS make discharge optimization a P&L priority, not a nice-to-have.
- **BG:** WHITE

#### 2.4 Traction (timeline or metric cards)
- **Heading:** "Where we are"
- **Layout:** Horizontal timeline or milestone cards
- **Milestones (GREEN tier only):**
  - "Founded" — 2024 / Physician-founded, operator-built
  - "Product" — MVP live / AI-augmented discharge workflow platform
  - "Customers" — First partner hospital engaged
  - "Team" — Clinical + technical founding team
- **Design:** Timeline with dots connected by PROVIDER_BLUE line, each milestone is a small card below/above the line (alternating). On mobile: vertical timeline.
- **BG:** OFF_WHITE

#### 2.5 Founder Section (reuse FounderSection pattern)
- **Layout:** Same SplitSection as Home — avatar left, bio right
- **Content:** Same founder bio but with investor-relevant framing: MD credentials, operator experience, domain expertise
- **BG:** WHITE

#### 2.6 BottomCTA
- **Heading:** "Let's talk."
- **Subtitle:** "Mene is available for a 30-minute investor conversation."
- **Buttons:** "Request Data Room" (outline) + "Schedule a Call" (AI_GOLD solid)

### Page-Level Notes
- SEO title: "For Investors — Metrias Medical"
- OG image: Market size visual with $49B callout
- No financial specifics beyond market sizing (RED firewall)
- Schema.org: Organization + FounderAction

---

## Page 3: About Us (`/about`)

**Goal:** Build trust and credibility. Show the humans behind the company — clinical expertise, technical depth, mission clarity.

**Audience mental model:** "Who are these people and why should I trust them with my hospital?"

### Section-by-Section Spec

#### 3.1 PageHero
- **Badge:** "About Us" (PAYER_SLATE bg, white text)
- **Heading:** "Physician-founded. Operator-built." (text-h1, white)
- **Subtitle:** "Metrias Medical was built by a physician who saw discharge bottlenecks from the inside — and decided to fix them from the outside." (text-body, white/80)
- **BG:** PROVIDER_BLUE_DARK

#### 3.2 Mission Statement
- **Layout:** Centered text block, generous whitespace
- **Heading:** "Our Mission"
- **Body:** Single paragraph — the Metrias mission statement. Large text (text-h3 weight, Manrope Medium). Centered, max-w-3xl.
- **Accent:** Thin AI_GOLD horizontal rule above and below the text block (decorative, 2px, max-w-24, centered)
- **BG:** OFF_WHITE

#### 3.3 Founder Deep Dive (SplitSection, expanded)
- **Layout:** 60/40 — larger photo left, text right
- **Photo:** Mene professional headshot (not the avatar — full photo if available, else avatar)
- **Content:**
  - Name: "Mene Demestihas, MD" (text-h2)
  - Title: "Founder & CEO" (text-small, PAYER_SLATE)
  - Bio: 3-4 paragraphs — medical background, the "aha moment" that led to Metrias, vision for the company. More personal than the Home page version.
  - Optional: LinkedIn link icon
- **BG:** WHITE

#### 3.4 Values (FeatureGrid 3-column)
- **Heading:** "What drives us"
- **Values:**
  1. "Clinical rigor" — Every decision is grounded in evidence and patient outcomes.
  2. "Operator empathy" — We've been in the trenches. We build for how hospitals actually work.
  3. "Radical transparency" — Our clients see every metric. No black boxes.
- **Design:** Each value is a card with a large number (01, 02, 03) in AI_GOLD as a decorative element, title in DM Sans, description in Manrope.
- **BG:** OFF_WHITE

#### 3.5 BottomCTA
- **Heading:** "Want to join the mission?"
- **Subtitle:** "We're always looking for exceptional people who care about fixing healthcare operations."
- **Buttons:** "Contact Us" (outline) + "View Open Roles" (AI_GOLD solid, links to LinkedIn jobs or mailto)

### Page-Level Notes
- SEO title: "About Us — Metrias Medical"
- OG image: Founder photo with Metrias branding
- Schema.org: AboutPage + Person (founder)

---

## Page 4: Product & Client Portal (`/product`)

**Goal:** Explain what Metrias actually does — the product, the workflow, the technology. Dual audience: prospective hospitals evaluating the product AND existing clients looking for the portal login.

**Audience mental model:** Prospects: "Show me the product." Clients: "Where do I log in?"

### Section-by-Section Spec

#### 4.1 PageHero
- **Badge:** "Product" (PROVIDER_BLUE bg, white text)
- **Heading:** "The discharge operations platform." (text-h1, white)
- **Subtitle:** "Remote expeditors + AI intelligence + real-time visibility — in one unified workflow." (text-body, white/80)
- **CTA Row:** "Request Demo" (AI_GOLD) + "Client Portal Login →" (text link, white underline, links to external portal URL)
- **BG:** PROVIDER_BLUE_DARK

#### 4.2 Product Overview (3-pillar layout)
- **Heading:** "Three layers, one platform"
- **Layout:** 3 tall cards side-by-side (equal height), each with:
  - Top color accent bar (4px): Card 1 = PROVIDER_BLUE, Card 2 = AI_GOLD, Card 3 = PATIENT_MOSS
  - Icon (emoji or SVG)
  - Title (text-h3)
  - Description (text-body-sm, 3-4 lines)
- **Cards:**
  1. 🧑‍⚕️ "Remote Expeditors" — "Trained discharge specialists work remotely inside your EHR, handling the administrative work that bogs down your nurses and case managers."
  2. 🤖 "AI Engine" — "Our platform learns from every discharge — identifying patterns, predicting bottlenecks, and recommending the next-best-action for each patient."
  3. 📊 "Live Dashboard" — "Real-time visibility into discharge status, bottleneck hotspots, and throughput metrics — accessible to your ops team 24/7."
- **BG:** OFF_WHITE
- **Mobile:** Stack vertically

#### 4.3 How It Works (expanded step flow)
- **Heading:** "From bottleneck to breakthrough"
- **Layout:** Vertical step flow with alternating left/right content (zigzag pattern)
- **Steps:**
  1. "Connect" — "We integrate with your EHR and configure discharge protocols. No IT project — typically live in under 2 weeks."
  2. "Deploy" — "Remote expeditors begin working your discharge queue, following your protocols and escalation paths."
  3. "Learn" — "The AI layer analyzes every action, identifies delay patterns, and surfaces recommendations to expeditors and your team."
  4. "Optimize" — "Monthly reviews with your ops team. Continuous protocol refinement. Measurable ROI reporting."
- **Design:** Each step has a large step number (text-display size, AI_GOLD, 20% opacity as background decoration), a heading (text-h3), and 2-line description. Alternating: odd steps = content left + decorative right, even steps = decorative left + content right.
- **BG:** WHITE
- **Mobile:** Linear stack, no zigzag

#### 4.4 Integration Logos
- **Heading:** "Works with your existing systems"
- **Layout:** Logo row — Epic, Cerner, Meditech (placeholder SVGs, grayscale, hover: full color)
- **Subtext:** "Metrias integrates at the EHR layer — no middleware, no custom builds."
- **BG:** LIGHT_GRAY
- **Note to Dev.agent:** Use placeholder SVG rectangles labeled with names until real partner logos are approved (YELLOW tier — confirm with Mene before using real logos)

#### 4.5 Client Portal CTA Card
- **Layout:** Centered card, distinct from rest of page
- **Design:** Bordered card (BORDER_GRAY), rounded-2xl, subtle shadow, padded generously
- **Content:**
  - Heading: "Existing client?" (text-h3)
  - Body: "Access your discharge dashboard, reports, and team management tools."
  - Button: "Go to Client Portal →" (PROVIDER_BLUE solid, white text)
- **BG:** OFF_WHITE (card sits on OFF_WHITE, distinguished by border + shadow)

#### 4.6 BottomCTA
- **Heading:** "See it in action."
- **Subtitle:** "15-minute demo — we'll show you projected ROI for your facility."
- **Buttons:** "Contact Us" (outline) + "Request Demo" (AI_GOLD solid)

### Page-Level Notes
- SEO title: "Product & Client Portal — Metrias Medical"
- OG image: Product screenshot or dashboard mockup (needs design)
- Schema.org: SoftwareApplication + Product
- Client Portal URL: Configurable via environment variable or Astro config

---

## Component Architecture Summary

```
src/
├── components/
│   ├── global/
│   │   ├── Navbar.astro          ← existing (add active link state)
│   │   ├── Footer.astro          ← existing
│   │   ├── SEOHead.astro         ← existing
│   │   ├── PageHero.astro        ← NEW: reusable inner page hero
│   │   ├── SplitSection.astro    ← NEW: 50/50 or 60/40 image+text
│   │   ├── StatCard.astro        ← NEW: extracted from ProblemStats
│   │   ├── TestimonialCard.astro ← NEW: quote card
│   │   ├── FeatureGrid.astro     ← NEW: icon+title+desc grid
│   │   └── AccordionFAQ.tsx      ← NEW: React island, expandable
│   ├── home/
│   │   └── (existing components)
│   ├── hospitals/
│   │   └── HowItWorks.astro      ← 3-step process flow
│   ├── investors/
│   │   └── Timeline.astro        ← Milestone timeline
│   └── product/
│       ├── PillarCards.astro      ← 3 product pillar cards
│       ├── StepFlow.astro         ← Zigzag step flow
│       └── IntegrationLogos.astro ← Partner logo row
├── pages/
│   ├── index.astro               ← existing
│   ├── hospitals.astro           ← NEW
│   ├── investors.astro           ← NEW
│   ├── about.astro               ← NEW
│   └── product.astro             ← NEW
└── styles/
    └── global.css                ← UPDATE: add type scale + spacing tokens
```

## Design Tokens Referenced

All components use tokens from the existing `@theme` block in global.css:
- Colors: `--color-provider-blue`, `--color-provider-blue-dark`, `--color-ai-gold`, `--color-patient-moss`, `--color-payer-slate`, `--color-bottleneck-red`, `--color-black`, `--color-off-white`, `--color-light-gray`, `--color-mid-gray`, `--color-border-gray`
- Fonts: `--font-heading` (DM Sans), `--font-body` (Manrope)
- NEW tokens to add: type scale and section spacing (defined above)

## ADHD Optimization Notes

- Every page follows ≤3 primary CTAs rule
- Progressive disclosure: Product page uses step flow (don't show everything at once)
- Clear visual hierarchy: PageHero → Problem → Solution → Proof → CTA
- Generous section padding (96px desktop) creates breathing room
- No gratuitous animation on inner pages — Grainient is Home-only

## Responsive Behavior

- All grids collapse to single column below `md` (768px)
- SplitSections stack (image on top, text below) below `lg` (1024px)
- PageHero text left-aligns and reduces to text-h2 on mobile
- Step flows linearize (no zigzag) on mobile
- CTA button pairs stack vertically below `sm` (640px)

## Accessibility Requirements

- All images have meaningful alt text (not "image" or "photo")
- Color contrast: all text meets WCAG 2.1 AA (4.5:1 body, 3:1 large)
- Focus indicators on all interactive elements
- Accordion FAQ is keyboard-navigable (Enter/Space to toggle, Tab between items)
- Skip-to-content link (global fix)
