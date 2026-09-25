import { useEffect, useRef } from 'react';
import FundingModel from '../investors/FundingModel';
import { getViewer } from '../../lib/modelViewer';
import { initModelTelemetry } from '../../lib/modelTelemetry';

// Thin wrapper around the retired funding model. FundingModel.tsx is mounted unchanged; this
// component adds the data-model-* attributes that modelTelemetry.ts listens for to its rendered
// DOM after mount. React leaves attributes it does not manage alone, so they survive re-renders.
//
// Section names, in page order:
//   overview          intro above the model (this file)
//   round_inputs      FundingModel's "Round inputs" panel (sliders, lens toggle, burn and cash)
//   headline_numbers  the four big stats (cap, dilution, runway, founder %)
//   fit_signals       the three traffic lights (milestone, founder discipline, valuation)
//   use_of_funds      the allocation bar and legend
//   cash_trajectory   the 24-month cash sparkline
//   narrative         "If this round closes"
//   next_steps        calls to action below the model (this file)

const OUTPUT_BLOCKS = ['headline_numbers', 'fit_signals', 'use_of_funds', 'cash_trajectory', 'narrative'];

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Adds telemetry attributes to FundingModel's rendered DOM. Idempotent. */
export function annotateFundingModel(host: Element): void {
  const inputs = host.querySelector('section[aria-label="Inputs"]');
  const outputs = host.querySelector('section[aria-label="Outputs"]');

  if (inputs) {
    inputs.setAttribute('data-model-section', 'round_inputs');

    // Each slider or number field sits under the nearest ancestor holding its <label>.
    inputs.querySelectorAll('input').forEach((input, i) => {
      let node: Element | null = input.parentElement;
      let label: Element | null = null;
      while (node && node !== inputs && !label) {
        label = node.querySelector('label');
        node = node.parentElement;
      }
      input.setAttribute('data-model-input', slug(label?.textContent || '') || `input_${i + 1}`);
    });

    // The valuation lens (Healthtech or AI-native) is the model's scenario switch.
    inputs.querySelectorAll('[role="tab"]').forEach((tab) => {
      const name = (tab.textContent || '').trim();
      if (name) tab.setAttribute('data-model-scenario', name);
    });

    inputs.querySelectorAll('button:not([role="tab"])').forEach((btn) => {
      if (/share/i.test(btn.textContent || '')) btn.setAttribute('data-model-cta', 'share_scenario');
    });
  }

  if (outputs) {
    Array.from(outputs.children).forEach((block, i) => {
      const name = OUTPUT_BLOCKS[i];
      if (name) block.setAttribute('data-model-section', name);
    });
    // Allocation bar: the element whose children carry the per-segment title tooltips.
    const bar = outputs.querySelector('[data-model-section="use_of_funds"] [title]')?.parentElement;
    bar?.setAttribute('data-model-chart', 'use_of_funds');
    outputs
      .querySelector('[data-model-section="cash_trajectory"] svg')
      ?.setAttribute('data-model-chart', 'cash_trajectory');
  }
}

const ctaPrimary =
  'inline-block rounded-lg bg-ai-gold px-6 py-3 font-body text-base font-semibold text-provider-blue transition-colors hover:bg-ai-gold/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-provider-blue';
const ctaSecondary =
  'inline-block rounded-lg border-2 border-provider-blue px-6 py-2.5 font-body text-base font-semibold text-provider-blue transition-colors hover:bg-provider-blue/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-provider-blue';

export default function ModelPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !hostRef.current) return;
    annotateFundingModel(hostRef.current);

    let cancelled = false;
    let stop: (() => void) | undefined;
    void getViewer().then((viewer) => {
      if (!cancelled) stop = initModelTelemetry({ root, viewer });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div ref={rootRef} className="mx-auto max-w-7xl px-6 lg:px-16">
      <section data-model-section="overview" className="pt-10 pb-8 md:pt-14 md:pb-10">
        <span className="mb-4 inline-block rounded-full bg-ai-gold px-4 py-1.5 font-body text-sm font-semibold text-white">
          For Investors
        </span>
        <h1 className="font-heading text-[2rem] leading-tight font-bold text-black md:text-[2.75rem]">
          Pre-seed round model
        </h1>
        <p className="mt-4 max-w-3xl font-body text-lg leading-relaxed text-payer-slate">
          Move the inputs to see how check size, cap, burn and Series A dilution change ownership, runway and use
          of funds. Every output recalculates live.
        </p>
      </section>

      <div ref={hostRef}>
        <FundingModel />
      </div>

      <section
        data-model-section="next_steps"
        className="mt-12 mb-16 rounded-2xl border border-border-gray bg-white p-6 md:mt-16 md:mb-24 md:p-10"
      >
        <h2 className="font-heading text-2xl font-bold text-black md:text-[2rem]">Want to go deeper?</h2>
        <p className="mt-3 max-w-2xl font-body text-base leading-relaxed text-payer-slate">
          Talk through the assumptions with Mene, or ask for the data room.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="https://www.metriasmedical.com/connect/30min"
            target="_blank"
            rel="noopener"
            data-model-cta="book_call"
            className={ctaPrimary}
          >
            Book a 30-minute call
          </a>
          <a
            href="mailto:mene@metriasmedical.com?subject=Data%20room%20access"
            data-model-cta="request_data_room"
            className={ctaSecondary}
          >
            Request data room access
          </a>
          <a
            href="mailto:mene@metriasmedical.com?subject=Pre-seed%20model"
            data-model-cta="email_mene"
            className={ctaSecondary}
          >
            Email Mene
          </a>
        </div>
      </section>
    </div>
  );
}
