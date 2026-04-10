# Metrias Medical — Marketing Website

Marketing site for [www.metriasmedical.com](https://www.metriasmedical.com).

## Stack

- **Astro** — Static-first, zero JS by default
- **React** — Interactive islands only (Grainient background, hover-expand panels)
- **Tailwind CSS v4** — Design tokens via `@theme` block
- **TypeScript** — Strict mode

## Development

```bash
npm install
npm run dev        # localhost:4321
npm run build      # static output to ./dist/
npm run preview    # preview production build
```

## Branch Strategy

- `dev` — Active development branch
- `gh-pages` — Production (branch-protected, serves www.metriasmedical.com)
- `main` — Legacy, do not use

Never force-push to `gh-pages`. Merge via PR only.

## Deployment

`public/CNAME` must contain `www.metriasmedical.com`. Astro builds static HTML to `dist/`, which deploys via GitHub Pages.
