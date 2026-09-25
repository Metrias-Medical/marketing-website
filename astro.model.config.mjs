// @ts-check
// Second Astro build target: the gated model origin (model.metriasmedical.com).
//
// Build:  npm run build:model   (emits workers/model/assets/index.html and request.html)
// Dev:    npm run dev:model     (no Worker in front, so /me and /api/* are not served)
//
// Astro has no "pages directory" option, so this config points srcDir at src/pages-model,
// which has no pages/ subfolder of its own, and injects the two routes explicitly. The public
// build (astro.config.mjs) never sees src/pages-model, and this build never sees src/pages, so
// neither build can emit the other's pages.
//
// Only fonts, favicons and the logo are copied from public/ (publicDir is disabled): the rest of
// public/ is marketing imagery the gated page does not need.
//
// Gated-only JavaScript (the model, its wrapper, the telemetry and the viewer lookup) is emitted
// under _model/ instead of _astro/, so the Worker can serve _astro/ (React runtime, the request
// form) to visitors without a session while keeping _model/ behind the cookie. CSS is inlined
// into each HTML file for the same reason.
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);

/** Files from public/ that the gated origin needs, copied verbatim to the same paths. */
const PUBLIC_FILES = [
  'fonts',
  'favicon.svg',
  'favicon.ico',
  'images/brand/metrias-logo-static-v1.png',
];

/** Module paths whose code must only ever be served behind the session cookie. */
const GATED_MODULE_RE =
  /(src\/components\/investors\/FundingModel|src\/components\/model\/(ModelPage|DraftBanner)|src\/lib\/(modelTelemetry|modelViewer))/;

/** @param {{ moduleIds?: string[]; facadeModuleId?: string | null }} chunk */
function isGatedChunk(chunk) {
  const ids = [...(chunk.moduleIds ?? []), chunk.facadeModuleId ?? ''];
  return ids.some((id) => GATED_MODULE_RE.test(id.replace(/\\/g, '/')));
}

/** @returns {import('astro').AstroIntegration} */
function modelRoutes() {
  return {
    name: 'model-gate-routes',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        injectRoute({ pattern: '/', entrypoint: './src/pages-model/index.astro' });
        injectRoute({ pattern: '/request', entrypoint: './src/pages-model/request.astro' });
      },
      'astro:build:done': async ({ dir }) => {
        for (const rel of PUBLIC_FILES) {
          const from = fileURLToPath(new URL(`public/${rel}`, root));
          const to = fileURLToPath(new URL(rel, dir));
          await mkdir(fileURLToPath(new URL('./', new URL(rel, dir))), { recursive: true });
          await cp(from, to, { recursive: true });
        }
      },
    },
  };
}

export default defineConfig({
  site: 'https://model.metriasmedical.com',
  output: 'static',
  srcDir: './src/pages-model',
  publicDir: './src/pages-model/no-public',
  outDir: './workers/model/assets',
  cacheDir: './node_modules/.astro-model',
  build: {
    // "/request" is written as request.html (the Worker serves it for "/" without a session).
    format: 'file',
    inlineStylesheets: 'always',
  },
  integrations: [react(), modelRoutes()],
  vite: {
    plugins: [tailwindcss()],
    // Astro 6 builds the browser bundle in Vite's "client" environment; only its output names
    // change here. Server-side (prerender) chunk naming stays Astro's own.
    environments: {
      client: {
        build: {
          rollupOptions: {
            output: {
              entryFileNames: (chunk) =>
                isGatedChunk(chunk) ? '_model/[name].[hash].js' : '_astro/[name].[hash].js',
              chunkFileNames: (chunk) =>
                isGatedChunk(chunk) ? '_model/[name].[hash].js' : '_astro/[name].[hash].js',
            },
          },
        },
      },
    },
  },
});
