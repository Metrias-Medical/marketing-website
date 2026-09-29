// Client instrumentation for the gated model page (model.metriasmedical.com).
// Event names and properties follow docs/model-gate/CONTRACT.md ("PostHog events").
//
// Everything is attached by delegated listeners on data attributes, so the instrumented content
// (FundingModel.tsx) needs no event wiring of its own:
//   data-model-section   a block whose views and dwell are measured
//   data-model-input     an assumption input (the attribute may sit on the control or an ancestor)
//   data-model-scenario  a control that selects a scenario
//   data-model-tab       a control that opens a tab
//   data-model-tooltip   a tooltip trigger (native title tooltips inside the root also count)
//   data-model-chart     a chart whose hover is counted (throttled to one event per second)
//   data-model-cta       a call to action
//   data-model-download  a downloadable asset
//
// posthog is the snippet instance that BaseLayout initialises on window; this module only
// reconfigures it for this origin and never loads a second copy.

import type { ModelViewer } from './modelViewer';

type Props = Record<string, unknown>;

interface PostHogLike {
  capture?: (event: string, props?: Props, options?: { transport?: 'XHR' | 'fetch' | 'sendBeacon' }) => void;
  identify?: (distinctId: string, setProps?: Props) => void;
  set_config?: (config: Props) => void;
}

/** PostHog settings applied on the model origin only (the public site keeps its defaults). */
export const MODEL_POSTHOG_CONFIG = { capture_pageleave: true, capture_dead_clicks: true } as const;

export const ENGAGEMENT_ENDPOINT = '/api/engagement';

/** A section must be at least this share of itself, or of the viewport, on screen to count. */
const VISIBLE_SHARE = 0.5;
/** Dwell shorter than this (a section scrolled straight past) is not reported. */
const MIN_DWELL_MS = 500;
const CHART_HOVER_THROTTLE_MS = 1000;

export interface ModelTelemetryOptions {
  /** Element containing every [data-model-*] block to instrument. */
  root: HTMLElement;
  /** Result of GET /me; null when /me could not be reached (no identify, no beacon). */
  viewer: ModelViewer | null;
}

interface SectionState {
  name: string;
  inView: boolean;
  runningSince: number | null;
  accMs: number;
  seen: boolean;
}

function posthog(): PostHogLike | undefined {
  return (window as unknown as { posthog?: PostHogLike }).posthog;
}

function attr(el: Element | null | undefined, name: string): string | undefined {
  const v = el?.getAttribute(name);
  return v == null || v === '' ? undefined : v;
}

function toElement(t: EventTarget | null): Element | null {
  if (t instanceof Element) return t;
  if (t instanceof Node) return t.parentElement;
  return null;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function asValue(v: string): string | number {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : v;
}

/** magic_link when the page was reached through the /auth redirect, else returning_session. */
export function entryVia(): 'magic_link' | 'returning_session' {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.redirectCount > 0) return 'magic_link';
  } catch {
    /* Navigation Timing unavailable */
  }
  return 'returning_session';
}

/**
 * Starts instrumentation and returns a function that removes every listener. Call once per page
 * load, after the [data-model-*] attributes are in the DOM and GET /me has settled.
 */
export function initModelTelemetry({ root, viewer }: ModelTelemetryOptions): () => void {
  const ph = posthog();
  const visitN = viewer ? viewer.visit_count : null;
  const cleanups: Array<() => void> = [];
  const now = () => performance.now();
  const docVisible = () => document.visibilityState !== 'hidden';

  function on<K extends keyof DocumentEventMap>(
    type: K,
    fn: (e: DocumentEventMap[K]) => void,
    opts: AddEventListenerOptions = { capture: true, passive: true },
  ) {
    document.addEventListener(type, fn, opts);
    cleanups.push(() => document.removeEventListener(type, fn, opts));
  }
  function onWindow<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) {
    window.addEventListener(type, fn);
    cleanups.push(() => window.removeEventListener(type, fn));
  }

  const inRoot = (el: Element | null): el is Element => !!el && root.contains(el);
  const sectionOf = (el: Element | null) => attr(el?.closest('[data-model-section]'), 'data-model-section');

  let scenario: string | null =
    attr(root.querySelector('[data-model-scenario][aria-selected="true"]'), 'data-model-scenario') ?? null;
  let lastCta: string | null = null;

  function capture(event: string, props: Props = {}, target?: Element | null, beacon = false) {
    const p: Props = { ...props, session_visit_n: visitN, scenario };
    if (p.section === undefined) {
      const section = target ? sectionOf(target) : undefined;
      if (section) p.section = section;
    }
    try {
      ph?.capture?.(event, p, beacon ? { transport: 'sendBeacon' } : undefined);
    } catch {
      /* analytics is non-blocking */
    }
  }

  // Init: origin-only config, identity, page view.
  try {
    ph?.set_config?.({ ...MODEL_POSTHOG_CONFIG });
    if (viewer) {
      ph?.identify?.(viewer.email_hash, {
        persona: viewer.persona,
        org_domain: viewer.org_domain,
        first_name: viewer.first_name,
      });
    }
  } catch {
    /* non-blocking */
  }
  capture('model_page_viewed', { entry_via: entryVia() });

  // Page-level engaged time (visible tab only), reported to the Worker on pagehide.
  let pageRunningSince: number | null = docVisible() ? now() : null;
  let pageAccMs = 0;
  const pausePage = () => {
    if (pageRunningSince !== null) {
      pageAccMs += now() - pageRunningSince;
      pageRunningSince = null;
    }
  };
  const resumePage = () => {
    if (pageRunningSince === null && docVisible()) pageRunningSince = now();
  };

  // Sections: first view (order_seen, ms_since_load) and dwell while at least half visible.
  const sections = new Map<Element, SectionState>();
  const seenOrder: string[] = [];
  root.querySelectorAll('[data-model-section]').forEach((el) => {
    const name = attr(el, 'data-model-section');
    if (name) sections.set(el, { name, inView: false, runningSince: null, accMs: 0, seen: false });
  });

  const startDwell = (s: SectionState) => {
    if (s.runningSince === null && s.inView && docVisible()) s.runningSince = now();
  };
  const pauseDwell = (s: SectionState) => {
    if (s.runningSince !== null) {
      s.accMs += now() - s.runningSince;
      s.runningSince = null;
    }
  };
  const flushDwell = (s: SectionState, beacon: boolean) => {
    pauseDwell(s);
    if (s.accMs >= MIN_DWELL_MS) {
      capture('model_section_dwell', { section: s.name, dwell_ms: Math.round(s.accMs) }, null, beacon);
    }
    s.accMs = 0;
  };

  if ('IntersectionObserver' in window && sections.size) {
    const thresholds = Array.from({ length: 21 }, (_, i) => i / 20);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const s = sections.get(e.target);
          if (!s) continue;
          const viewportH = e.rootBounds?.height || window.innerHeight;
          const visible =
            e.isIntersecting &&
            (e.intersectionRatio >= VISIBLE_SHARE || e.intersectionRect.height >= viewportH * VISIBLE_SHARE);
          if (visible === s.inView) continue;
          s.inView = visible;
          if (visible) {
            if (!s.seen) {
              s.seen = true;
              seenOrder.push(s.name);
              capture('model_section_viewed', {
                section: s.name,
                order_seen: seenOrder.length,
                ms_since_load: Math.round(now()),
              });
            }
            startDwell(s);
          } else {
            flushDwell(s, false);
          }
        }
      },
      { threshold: thresholds },
    );
    sections.forEach((_, el) => io.observe(el));
    cleanups.push(() => io.disconnect());
  }

  on('visibilitychange', () => {
    if (docVisible()) {
      resumePage();
      sections.forEach(startDwell);
    } else {
      pausePage();
      sections.forEach(pauseDwell);
    }
  });

  function sendEngagement() {
    pausePage();
    const engagedSeconds = Math.round(pageAccMs / 1000);
    pageAccMs = 0;
    if (!viewer) return;
    const body = JSON.stringify({
      engaged_seconds: engagedSeconds,
      sections_seen: seenOrder.slice(),
      final_scenario: scenario,
      cta: lastCta,
    });
    let queued = false;
    try {
      queued = navigator.sendBeacon?.(ENGAGEMENT_ENDPOINT, new Blob([body], { type: 'application/json' })) ?? false;
    } catch {
      queued = false;
    }
    if (!queued) {
      fetch(ENGAGEMENT_ENDPOINT, {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => {});
    }
  }

  onWindow('pagehide', () => {
    sections.forEach((s) => flushDwell(s, true));
    sendEngagement();
  });
  // Restored from the back/forward cache: carry on measuring (the next pagehide sends a delta).
  onWindow('pageshow', (e) => {
    if (!e.persisted) return;
    resumePage();
    sections.forEach(startDwell);
  });

  // Assumptions: remember the value when the control is picked up, report on commit (change).
  const startValues = new WeakMap<Element, string>();
  type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const controlOf = (t: EventTarget | null): Control | null => {
    const el = toElement(t);
    if (!inRoot(el)) return null;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      return el.closest('[data-model-input]') ? el : null;
    }
    return null;
  };
  const remember = (e: Event) => {
    const c = controlOf(e.target);
    if (c && !startValues.has(c)) startValues.set(c, c.value);
  };
  on('focusin', remember);
  on('pointerdown', remember);
  on('change', (e) => {
    const c = controlOf(e.target);
    if (!c) return;
    const input = attr(c.closest('[data-model-input]'), 'data-model-input');
    const from = startValues.get(c) ?? (c instanceof HTMLSelectElement ? undefined : c.defaultValue);
    const to = c.value;
    startValues.set(c, to);
    if (!input || from === to) return;
    capture('model_assumption_changed', { input, from: from === undefined ? null : asValue(from), to: asValue(to) }, c);
  });

  // Clicks: scenario, tab, CTA, download.
  on('click', (e) => {
    const el = toElement(e.target);
    if (!inRoot(el)) return;
    const scen = el.closest('[data-model-scenario]');
    if (scen) {
      const name = attr(scen, 'data-model-scenario');
      if (name) {
        scenario = name;
        capture('model_scenario_selected', { scenario: name }, scen);
      }
    }
    const tab = attr(el.closest('[data-model-tab]'), 'data-model-tab');
    if (tab) capture('model_tab_opened', { tab }, el);
    const cta = attr(el.closest('[data-model-cta]'), 'data-model-cta');
    if (cta) {
      lastCta = cta;
      capture('model_cta_clicked', { cta }, el);
    }
    const asset = attr(el.closest('[data-model-download]'), 'data-model-download');
    if (asset) capture('model_download_clicked', { asset }, el);
  });

  // Tooltips: explicit data-model-tooltip triggers, and native title tooltips inside the root.
  let openTip: Element | null = null;
  const tipOf = (t: EventTarget | null) => {
    const el = toElement(t);
    if (!inRoot(el)) return null;
    const tip = el.closest('[data-model-tooltip], [title]');
    return inRoot(tip) ? tip : null;
  };
  const tipId = (tip: Element) =>
    attr(tip, 'data-model-tooltip') ?? (slug((tip.getAttribute('title') || '').split(':')[0]) || 'untitled');
  const enterTip = (e: Event) => {
    const tip = tipOf(e.target);
    if (!tip || tip === openTip) return;
    openTip = tip;
    capture('model_tooltip_opened', { id: tipId(tip) }, tip);
  };
  on('pointerover', enterTip);
  on('focusin', enterTip);
  on('pointerout', (e) => {
    if (openTip && !(e.relatedTarget instanceof Node && openTip.contains(e.relatedTarget))) openTip = null;
  });

  // Chart hover, at most once per second per chart.
  const lastHover = new Map<string, number>();
  on('pointermove', (e) => {
    const el = toElement(e.target);
    if (!inRoot(el)) return;
    const chartEl = el.closest('[data-model-chart]');
    const chart = attr(chartEl, 'data-model-chart');
    if (!chart) return;
    const t = now();
    if (t - (lastHover.get(chart) ?? -Infinity) < CHART_HOVER_THROTTLE_MS) return;
    lastHover.set(chart, t);
    capture('model_chart_hovered', { chart }, chartEl);
  });

  // Copy: length of the copied selection only, never its text.
  on('copy', () => {
    const sel = document.getSelection();
    const anchor = toElement(sel?.anchorNode ?? null);
    capture('model_copy', { length: sel ? sel.toString().length : 0 }, inRoot(anchor) ? anchor : null);
  });

  // Print (and print to PDF).
  let lastPrint = -Infinity;
  const onPrint = () => {
    const t = now();
    if (t - lastPrint < 1000) return;
    lastPrint = t;
    capture('model_print_attempted');
  };
  onWindow('beforeprint', onPrint);
  const printMq = window.matchMedia?.('print');
  if (printMq?.addEventListener) {
    const onMq = (e: MediaQueryListEvent) => {
      if (e.matches) onPrint();
    };
    printMq.addEventListener('change', onMq);
    cleanups.push(() => printMq.removeEventListener('change', onMq));
  }

  return () => {
    cleanups.splice(0).forEach((fn) => fn());
  };
}
