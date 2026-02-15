# Metrias Medical Website – Design Fix Specification

**Purpose**: Handoff document for agentic CLI to implement design improvements
**Reference**: Screenshot from 2025-12-24
**Design System**: Navy (#1a2b4a or similar), Gold (#c9a227 or similar), White backgrounds

---

## Fix 1: Replace LinkedIn Embed with Designed Testimonial Card

### Current State
Raw LinkedIn post embed at bottom of page – breaks visual cohesion, looks like afterthought.

### Target State
Custom-designed testimonial/social proof card that matches site aesthetic.

### Implementation

```html
<section class="social-proof">
  <div class="testimonial-card">
    <div class="testimonial-content">
      <img src="[mene-headshot.jpg]" alt="Mene Demestihas, MD" class="testimonial-avatar" />
      <blockquote>
        "This story will resonate with most ED docs..."
      </blockquote>
      <div class="testimonial-meta">
        <span class="testimonial-author">Mene Demestihas, MD</span>
        <span class="testimonial-role">Emergency Physician | Health Tech Executive</span>
      </div>
      <a href="[linkedin-post-url]" class="linkedin-link" target="_blank" rel="noopener">
        <svg><!-- LinkedIn icon --></svg>
        <span>View on LinkedIn</span>
      </a>
    </div>
    <div class="engagement-stats">
      <span>644 reactions</span>
      <span>110 comments</span>
      <span>68 reposts</span>
    </div>
  </div>
</section>
```

### Styling Requirements
- Card: White or slight off-white background with subtle shadow (box-shadow: 0 4px 24px rgba(0,0,0,0.08))
- Avatar: 80px circle, border: 3px solid gold
- Blockquote: Larger text (1.25rem), navy color, optional gold left border or opening quote mark
- LinkedIn icon: Small, subtle – navy or gray, not LinkedIn blue
- Engagement stats: Small, muted text – serves as social proof without being garish
- Overall: Should feel like a designed element, not an embed

---

## Fix 2: Reimagine "The Model" Section

### Current State
Three columns with #1, #2, #3 headers – generic, template-like, forgettable.

### Target State
Visually distinctive representation of the three-part model that creates a memorable impression.

### Option A: Connected Timeline/Flow (Recommended)

```html
<section class="the-model">
  <h2>The Model</h2>
  <div class="model-flow">
    <div class="model-step" data-step="1">
      <div class="step-marker">
        <span class="step-number">01</span>
        <div class="connector-line"></div>
      </div>
      <div class="step-content">
        <h3>Expeditors</h3>
        <p>Remote clinical Expeditors tackle the discharge logistics...</p>
      </div>
    </div>
    <!-- Repeat for steps 2 and 3 -->
  </div>
</section>
```

### Styling Requirements
- Step numbers: Large (3rem+), gold color, monospace or display font
- Connector lines: Horizontal on desktop, vertical on mobile – gold or navy, could be dashed or have animated dash effect
- Step content cards: Slight offset/stagger vertically to create diagonal flow
- Consider subtle entrance animations on scroll (stagger reveal)
- Background: Light texture or subtle grid pattern

### Option B: Interconnected Nodes (Alternative)
If timeline doesn't fit, create node diagram with:
- Three circular nodes arranged in triangle or horizontal
- Connecting lines between them showing data/workflow flow
- Hover states that highlight connections

---

## Fix 3: Add Background Textures to White Sections

### Current State
Flat white backgrounds in "The Execution Gap" and "For Capacity Constrained Systems" sections.

### Target State
Subtle atmospheric depth without compromising professionalism.

### Implementation Options (pick one per section or consistent across all)

**Option A: Subtle Noise Texture**
```css
.section-white {
  background-color: #ffffff;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-blend-mode: soft-light;
  background-size: 200px;
}
```
- Noise opacity should be very low (5-10%)

**Option B: Subtle Geometric Pattern**
```css
.section-white {
  background-color: #fafafa;
  background-image: 
    linear-gradient(135deg, transparent 74%, rgba(26,43,74,0.02) 75%),
    linear-gradient(45deg, transparent 74%, rgba(26,43,74,0.02) 75%);
  background-size: 60px 60px;
}
```

**Option C: Gradient Mesh (very subtle)**
```css
.section-white {
  background: 
    radial-gradient(ellipse at 20% 50%, rgba(201,162,39,0.03) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 80%, rgba(26,43,74,0.03) 0%, transparent 50%),
    #ffffff;
}
```

### Application
- Apply consistently to all white-background sections
- Ensure text contrast remains strong (WCAG AA minimum)

---

## Fix 4: Establish Consistent Angular Motif

### Current State
Hero has diagonal/angular clip-path or shape, but motif doesn't repeat anywhere else.

### Target State
Either commit to angular design language throughout OR simplify hero.

### Recommended: Commit to Angular (carries through)

**Section Dividers**
```css
.section-divider-angle {
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 60px), 0 100%);
}

/* Or use pseudo-element */
.section::after {
  content: '';
  position: absolute;
  bottom: -30px;
  left: 0;
  right: 0;
  height: 60px;
  background: inherit;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 0 0);
}
```

**Apply Angular Treatment To:**
1. Hero section (already has it – keep)
2. Transition from white sections to navy "The Model" section
3. Quote/testimonial block top edge
4. CTA button hover states (subtle skew transform)

**Accent Elements**
- Add small angular shapes as decorative elements near section titles
- Use angled underlines on headings instead of straight

### Alternative: Remove Angular from Hero
If angular is too complex to carry through, simplify hero to straight edges and rely on color blocking alone.

---

## Fix 5: Typography Upgrade

### Current State
Safe serif/sans-serif pairing that reads as "premium template."

### Target State
More characterful display font for headlines while maintaining readability.

### Font Recommendations (Google Fonts available)

**Display/Headlines – Pick One:**
- **Outfit** – Geometric, modern, distinctive without being quirky
- **Fraunces** – Variable serif with personality, works well with "billion dollar problem" messaging
- **Sora** – Clean geometric with unique character
- **Epilogue** – Modern with editorial feel

**Body – Keep or Replace With:**
- Current sans-serif is fine if working
- Alternative: **Source Sans 3** or **DM Sans** for slightly more character

### Implementation
```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,700;9..144,900&family=DM+Sans:wght@400;500;700&display=swap');

:root {
  --font-display: 'Fraunces', serif;
  --font-body: 'DM Sans', sans-serif;
}

h1, h2, h3 {
  font-family: var(--font-display);
}

body, p, li {
  font-family: var(--font-body);
}
```

### Hierarchy Refinement
- H1 (Hero): 4rem+, font-weight 900
- H2 (Section titles): 2.5rem, font-weight 700
- H3 (Subsections): 1.5rem, font-weight 700
- Body: 1.125rem, font-weight 400, line-height 1.6

---

## Fix 6: Secondary Improvements

### 6a. "The Execution Gap" – 32% Stat Treatment

**Current**: Stat floats awkwardly
**Fix**: Create visual container connecting stat to explanation

```html
<div class="stat-block">
  <div class="stat-number">32%</div>
  <div class="stat-label">Avg ENT Acceptance Rate</div>
  <div class="stat-explanation">
    Hospital case managers are drowning...
  </div>
</div>
```

```css
.stat-block {
  border-left: 4px solid var(--gold);
  padding-left: 2rem;
}

.stat-number {
  font-family: var(--font-display);
  font-size: 4rem;
  font-weight: 900;
  color: var(--navy);
  line-height: 1;
}

.stat-label {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--gold);
  margin-bottom: 1rem;
}
```

### 6b. CTA Button Consistency

**Current**: "FOR HOSPITALS" and "DISCUSS A PILOT" have different visual weights
**Fix**: Establish button hierarchy

```css
/* Primary CTA */
.btn-primary {
  background: var(--gold);
  color: var(--navy);
  padding: 1rem 2rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: none;
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(201,162,39,0.4);
}

/* Secondary CTA */
.btn-secondary {
  background: transparent;
  color: var(--navy);
  padding: 1rem 2rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 2px solid var(--navy);
}
```

Apply: "FOR HOSPITALS" = primary, "DISCUSS A PILOT" = secondary (or both primary if equal importance)

### 6c. About Section Typography

**Current**: Feels cramped
**Fix**: 
- Increase line-height to 1.7
- Add more margin between paragraphs (1.5rem)
- Consider two-column layout on desktop (bio left, credentials right)

### 6d. Footer Enhancement

**Current**: Minimal/incomplete
**Fix**: Add structured footer with:
- Logo
- Quick links (For Hospitals, About, Contact)
- Contact email
- LinkedIn icon link
- Copyright line
- Optional: "The expeditor layer for hospital discharge"

---

## Implementation Priority

1. **Fix 2** – "The Model" section (highest visual impact)
2. **Fix 1** – LinkedIn embed replacement (removes biggest eyesore)
3. **Fix 5** – Typography upgrade (improves everything)
4. **Fix 3** – Background textures (adds depth)
5. **Fix 4** – Angular motif consistency
6. **Fix 6a-d** – Secondary refinements

---

## Success Criteria

- [ ] No raw social embeds visible
- [ ] "The Model" section is visually memorable, not template-like
- [ ] White sections have subtle texture/depth
- [ ] Angular motif either carries through or is removed
- [ ] Display font is distinctive (not Inter, Roboto, Arial, system fonts)
- [ ] All CTAs have consistent styling
- [ ] Page feels cohesive and intentionally designed
- [ ] Mobile responsive maintained

---

## Notes for CLI Agent

- Preserve all existing content/copy
- Maintain responsive breakpoints
- Test contrast ratios after texture additions
- If using animations, ensure prefers-reduced-motion is respected
- Keep load performance in mind – optimize any added assets
