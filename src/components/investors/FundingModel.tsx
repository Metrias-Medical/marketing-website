import { useEffect, useMemo, useState } from 'react';

type ValuationMode = 'Healthtech' | 'AI-native';
type Light = 'green' | 'yellow' | 'red';

const FOUNDER_PCT_PRE_ROUND = 0.995;
const TARGET_ARR_SEED = 500_000;

const VALUATION_DEFAULTS: Record<ValuationMode, number> = {
  Healthtech: 8_000_000,
  'AI-native': 12_000_000,
};

const COMP_RANGES: Record<ValuationMode, { low: number; high: number }> = {
  Healthtech: { low: 5_000_000, high: 10_000_000 },
  'AI-native': { low: 10_000_000, high: 18_000_000 },
};

function allocate(check: number) {
  const cap1 = 250_000;
  const cap2 = 400_000;
  const cap3 = 650_000;

  let ops = Math.min(check, cap1);
  let aiBd = 0;
  let rd = 0;
  let advisor = 0;
  let buffer = 0;
  let remaining = Math.max(0, check - cap1);

  if (remaining > 0) {
    const t2 = Math.min(remaining, cap2 - cap1);
    aiBd += t2;
    remaining -= t2;
  }
  if (remaining > 0) {
    const t3 = Math.min(remaining, cap3 - cap2);
    aiBd += t3 * 0.6;
    rd += t3 * 0.4;
    remaining -= t3;
  }
  if (remaining > 0) {
    advisor += remaining * 0.4;
    buffer += remaining * 0.6;
  }

  return { ops, aiBd, rd, advisor, buffer };
}

function fmtUSD(n: number, abbr = false): string {
  if (!Number.isFinite(n)) return '—';
  if (abbr) {
    if (Math.abs(n) >= 1_000_000) {
      const v = n / 1_000_000;
      return `$${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
    }
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${Math.round(n)}`;
  }
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

function milestoneFit(check: number): { light: Light; label: string; text: string } {
  if (check < 250_000)
    return {
      light: 'red',
      label: 'Under',
      text: 'Too thin to credibly land a paid pilot + 60 days of data.',
    };
  if (check <= 650_000)
    return {
      light: 'green',
      label: 'Right-sized',
      text: 'Funds ops + AI BD to land 1 paid pilot and capture 60 days of data.',
    };
  return {
    light: 'yellow',
    label: 'Over',
    text: 'Exceeds milestone — risks raising into Series A territory before earning it.',
  };
}

function founderDiscipline(pct: number): { light: Light; label: string; text: string } {
  if (pct > 0.65)
    return { light: 'green', label: 'Disciplined', text: `${fmtPct(pct)} retained post-Series A.` };
  if (pct >= 0.55)
    return { light: 'yellow', label: 'Caution', text: `${fmtPct(pct)} retained — watch dilution stacking.` };
  return { light: 'red', label: 'Over-diluted', text: `${fmtPct(pct)} retained — too thin for stage.` };
}

function valuationFit(cap: number, mode: ValuationMode): { light: Light; label: string; text: string } {
  const r = COMP_RANGES[mode];
  const rangeText = `${fmtUSD(r.low, true)}–${fmtUSD(r.high, true)}`;
  const lowEdge = r.low * 0.85;
  const highEdge = r.high * 1.15;
  if (cap < lowEdge)
    return { light: 'red', label: 'Undervalued', text: `Below ${mode} post-money seed comp range (${rangeText}).` };
  if (cap > highEdge)
    return { light: 'red', label: 'Overvalued', text: `Above ${mode} post-money seed comp range (${rangeText}).` };
  if (cap < r.low || cap > r.high)
    return { light: 'yellow', label: 'Edge of range', text: `Edge of ${mode} post-money seed comps (${rangeText}).` };
  return { light: 'green', label: 'Defensible', text: `Inside ${mode} post-money seed comp range (${rangeText}).` };
}

const LIGHT_STYLES: Record<Light, { dot: string; border: string; pill: string }> = {
  green: { dot: 'bg-patient-moss', border: 'border-patient-moss/40', pill: 'bg-patient-moss/10 text-patient-moss' },
  yellow: { dot: 'bg-ai-gold', border: 'border-ai-gold/40', pill: 'bg-ai-gold/10 text-ai-gold' },
  red: { dot: 'bg-bottleneck-red', border: 'border-bottleneck-red/40', pill: 'bg-bottleneck-red/10 text-bottleneck-red' },
};

function TrafficLight({
  title,
  result,
}: {
  title: string;
  result: { light: Light; label: string; text: string };
}) {
  const s = LIGHT_STYLES[result.light];
  return (
    <div className={`rounded-xl border bg-white p-5 ${s.border}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-heading text-sm font-bold uppercase tracking-wide text-payer-slate">{title}</h4>
        <span className={`h-3 w-3 rounded-full ${s.dot}`} aria-hidden />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.pill}`}>{result.label}</span>
      </div>
      <p className="mt-3 font-body text-sm leading-relaxed text-payer-slate">{result.text}</p>
    </div>
  );
}

function BigStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border-gray bg-white p-5">
      <div className="font-heading text-xs font-bold uppercase tracking-wide text-payer-slate">{label}</div>
      <div className="mt-2 font-heading text-3xl font-bold text-provider-blue md:text-4xl">{value}</div>
      {sub && <div className="mt-1 font-body text-xs text-payer-slate">{sub}</div>}
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="font-heading text-sm font-bold text-black">{label}</label>
        <span className="font-heading text-base font-bold text-provider-blue">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-provider-blue"
      />
      <div className="mt-1 flex justify-between font-body text-xs text-payer-slate">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  prefix = '$',
  suffix,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
}) {
  return (
    <div>
      <label className="mb-2 block font-heading text-sm font-bold text-black">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border border-border-gray bg-white px-3 py-2 focus-within:border-provider-blue">
        {prefix && <span className="font-body text-sm text-payer-slate">{prefix}</span>}
        <input
          type="number"
          inputMode="numeric"
          min={min}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => {
            const v = e.target.value === '' ? 0 : Number(e.target.value);
            onChange(Math.max(min, v));
          }}
          className="w-full bg-transparent font-body text-base text-black outline-none"
        />
        {suffix && <span className="font-body text-sm text-payer-slate">{suffix}</span>}
      </div>
    </div>
  );
}

export default function FundingModel() {
  // Initial values from URL params (if present) — keeps SSR happy with explicit defaults.
  const initial = useMemo(() => {
    const fallback = {
      checkSize: 400_000,
      postMoneyCap: 8_000_000,
      monthlyBurn: 2_000,
      currentCash: 20_000,
      mode: 'Healthtech' as ValuationMode,
      seriesADilution: 0.22,
    };
    if (typeof window === 'undefined') return fallback;
    const p = new URLSearchParams(window.location.search);
    const numParam = (k: string, d: number) => {
      const v = Number(p.get(k));
      return Number.isFinite(v) && v > 0 ? v : d;
    };
    const modeParam = p.get('m');
    return {
      checkSize: numParam('c', fallback.checkSize),
      postMoneyCap: numParam('p', fallback.postMoneyCap),
      monthlyBurn: numParam('b', fallback.monthlyBurn),
      currentCash: Math.max(0, Number(p.get('cash')) || fallback.currentCash),
      mode: (modeParam === 'AI-native' ? 'AI-native' : 'Healthtech') as ValuationMode,
      seriesADilution: numParam('sa', fallback.seriesADilution),
    };
  }, []);

  const [checkSize, setCheckSize] = useState(initial.checkSize);
  const [postMoneyCap, setPostMoneyCap] = useState(initial.postMoneyCap);
  const [monthlyBurn, setMonthlyBurn] = useState(initial.monthlyBurn);
  const [currentCash, setCurrentCash] = useState(initial.currentCash);
  const [mode, setMode] = useState<ValuationMode>(initial.mode);
  const [seriesADilution, setSeriesADilution] = useState(initial.seriesADilution);
  const [shareNotice, setShareNotice] = useState('');

  const handleModeChange = (newMode: ValuationMode) => {
    setMode(newMode);
    setPostMoneyCap(VALUATION_DEFAULTS[newMode]);
  };

  // URL sync (debounced)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      p.set('c', String(checkSize));
      p.set('p', String(postMoneyCap));
      p.set('b', String(monthlyBurn));
      p.set('cash', String(currentCash));
      p.set('m', mode);
      p.set('sa', String(seriesADilution));
      window.history.replaceState({}, '', `${window.location.pathname}?${p.toString()}`);
    }, 250);
    return () => clearTimeout(t);
  }, [checkSize, postMoneyCap, monthlyBurn, currentCash, mode, seriesADilution]);

  // Calculations
  // Post-money cap convention (YC 2018+): the cap IS the post-money valuation at conversion,
  // so the investor's ownership is check / cap directly. No addition.
  const postMoney = postMoneyCap;
  const preMoneyEquiv = Math.max(0, postMoneyCap - checkSize);
  const newInvestorPct = postMoneyCap > 0 ? checkSize / postMoneyCap : 0;
  const founderPctPostPreSeed = (1 - newInvestorPct) * FOUNDER_PCT_PRE_ROUND;
  const founderPctPostSeedA = founderPctPostPreSeed * (1 - seriesADilution);
  const safeBurn = Math.max(monthlyBurn, 0);
  const runwayMonths = safeBurn > 0 ? (currentCash + checkSize) / safeBurn : Infinity;
  const impliedArrMultiple = postMoneyCap / TARGET_ARR_SEED;
  const alloc = allocate(checkSize);

  const runwayDisplay = !Number.isFinite(runwayMonths)
    ? '∞'
    : runwayMonths > 60
    ? `${(runwayMonths / 12).toFixed(1)} yrs`
    : `${runwayMonths.toFixed(0)} mo`;

  const mFit = milestoneFit(checkSize);
  const fFit = founderDiscipline(founderPctPostSeedA);
  const vFit = valuationFit(postMoneyCap, mode);

  // Sparkline: 24-month cash trajectory under current burn
  const sparkPoints = useMemo(() => {
    const startCash = currentCash + checkSize;
    const pts: { m: number; cash: number }[] = [];
    for (let m = 0; m <= 24; m++) {
      pts.push({ m, cash: Math.max(0, startCash - safeBurn * m) });
    }
    return pts;
  }, [currentCash, checkSize, safeBurn]);

  const sparkW = 320;
  const sparkH = 64;
  const sparkMax = sparkPoints[0].cash || 1;
  const sparkPath = sparkPoints
    .map((p, i) => {
      const x = (p.m / 24) * sparkW;
      const y = sparkH - (p.cash / sparkMax) * (sparkH - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const sparkArea = `${sparkPath} L${sparkW},${sparkH} L0,${sparkH} Z`;

  // Use-of-funds segments
  const totalCheck = checkSize || 1;
  const segments = [
    { key: 'ops', label: 'Core ops', amount: alloc.ops, color: 'bg-provider-blue' },
    { key: 'aiBd', label: 'AI BD tooling', amount: alloc.aiBd, color: 'bg-ai-gold' },
    { key: 'rd', label: 'R&D', amount: alloc.rd, color: 'bg-patient-moss' },
    { key: 'advisor', label: 'Advisor retainer', amount: alloc.advisor, color: 'bg-bottleneck-red' },
    { key: 'buffer', label: 'Pilot expansion buffer', amount: alloc.buffer, color: 'bg-payer-slate' },
  ];

  const handleShare = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShareNotice('Link copied');
    } catch {
      setShareNotice('Copy this URL from the address bar');
    }
    setTimeout(() => setShareNotice(''), 2500);
  };

  // Narrative phrasing
  const milestonePhrase =
    mFit.light === 'green'
      ? 'enough to land'
      : mFit.light === 'red'
      ? 'tight for'
      : 'well beyond';
  const runwayPhrase = !Number.isFinite(runwayMonths)
    ? 'indefinite at zero burn'
    : runwayMonths > 60
    ? `~${(runwayMonths / 12).toFixed(1)} years`
    : `~${runwayMonths.toFixed(0)} months`;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* INPUTS */}
      <section aria-label="Inputs" className="space-y-6 rounded-2xl border border-border-gray bg-light-gray/50 p-6 md:p-8">
        <div>
          <h2 className="font-heading text-xl font-bold text-black">Round inputs</h2>
          <p className="mt-1 font-body text-sm text-payer-slate">Drag to model the round live.</p>
        </div>

        <SliderRow
          label="Check size"
          min={100_000}
          max={1_500_000}
          step={25_000}
          value={checkSize}
          onChange={setCheckSize}
          format={(v) => fmtUSD(v, true)}
        />

        <SliderRow
          label="Post-money cap"
          min={3_000_000}
          max={25_000_000}
          step={250_000}
          value={postMoneyCap}
          onChange={setPostMoneyCap}
          format={(v) => fmtUSD(v, true)}
        />

        <div>
          <label className="mb-2 block font-heading text-sm font-bold text-black">Valuation lens</label>
          <div className="flex rounded-lg bg-mid-gray p-1" role="tablist">
            {(['Healthtech', 'AI-native'] as ValuationMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => handleModeChange(m)}
                className={`flex-1 rounded-md px-4 py-2 font-body text-sm font-semibold transition ${
                  mode === m ? 'bg-white text-provider-blue shadow-sm' : 'text-payer-slate'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="mt-2 font-body text-xs text-payer-slate">
            Toggling lens snaps the post-money cap to that segment's typical seed range.
          </p>
        </div>

        <SliderRow
          label="Series A dilution (assumed)"
          min={0.18}
          max={0.25}
          step={0.01}
          value={seriesADilution}
          onChange={setSeriesADilution}
          format={(v) => fmtPct(v, 0)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberRow label="Monthly burn" value={monthlyBurn} onChange={setMonthlyBurn} suffix="/mo" />
          <NumberRow label="Current cash" value={currentCash} onChange={setCurrentCash} />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleShare}
            className="rounded-lg bg-provider-blue px-4 py-2 font-body text-sm font-semibold text-white transition hover:bg-provider-blue-dark"
          >
            Share this scenario
          </button>
          {shareNotice && (
            <span className="font-body text-sm text-patient-moss" role="status">
              {shareNotice}
            </span>
          )}
        </div>
      </section>

      {/* OUTPUTS */}
      <section aria-label="Outputs" className="space-y-6">
        {/* Big numbers */}
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <BigStat
            label="Post-money cap"
            value={fmtUSD(postMoney, true)}
            sub={`${fmtUSD(preMoneyEquiv, true)} pre-money equiv`}
          />
          <BigStat label="New dilution" value={fmtPct(newInvestorPct)} sub="this round" />
          <BigStat label="Runway" value={runwayDisplay} sub={`at ${fmtUSD(monthlyBurn)}/mo burn`} />
          <BigStat
            label="Founder %"
            value={fmtPct(founderPctPostSeedA)}
            sub={`post-Series A (${fmtPct(seriesADilution, 0)})`}
          />
        </div>

        {/* Traffic lights */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TrafficLight title="Milestone fit" result={mFit} />
          <TrafficLight title="Founder discipline" result={fFit} />
          <TrafficLight title="Valuation defensibility" result={vFit} />
        </div>

        {/* Use of funds */}
        <div className="rounded-xl border border-border-gray bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h4 className="font-heading text-sm font-bold uppercase tracking-wide text-payer-slate">
              Use of funds
            </h4>
            <span className="font-body text-xs text-payer-slate">Auto-reshuffles with check size</span>
          </div>
          <div className="mt-4 flex h-10 w-full overflow-hidden rounded-md bg-mid-gray">
            {segments.map((s) =>
              s.amount > 0 ? (
                <div
                  key={s.key}
                  className={s.color}
                  style={{ width: `${(s.amount / totalCheck) * 100}%` }}
                  title={`${s.label}: ${fmtUSD(s.amount)}`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {segments.map((s) => (
              <div key={s.key} className="flex items-start gap-2">
                <span className={`mt-1 h-3 w-3 shrink-0 rounded-sm ${s.color}`} aria-hidden />
                <div>
                  <div className="font-body text-xs font-semibold text-black">{s.label}</div>
                  <div className="font-body text-xs text-payer-slate">
                    {fmtUSD(s.amount)} · {fmtPct(s.amount / totalCheck, 0)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sparkline */}
        <div className="rounded-xl border border-border-gray bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h4 className="font-heading text-sm font-bold uppercase tracking-wide text-payer-slate">
              24-month cash trajectory
            </h4>
            <span className="font-body text-xs text-payer-slate">Post-close, current burn</span>
          </div>
          <svg viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none" className="mt-3 h-20 w-full" aria-hidden>
            <path d={sparkArea} fill="currentColor" className="text-provider-blue/10" />
            <path d={sparkPath} fill="none" stroke="currentColor" strokeWidth={2} className="text-provider-blue" />
          </svg>
          <div className="mt-1 flex justify-between font-body text-xs text-payer-slate">
            <span>Now: {fmtUSD(currentCash + checkSize, true)}</span>
            <span>Month 24: {fmtUSD(sparkPoints[24].cash, true)}</span>
          </div>
        </div>

        {/* Narrative */}
        <div className="rounded-xl border border-provider-blue/20 bg-provider-blue/5 p-5">
          <h4 className="font-heading text-sm font-bold uppercase tracking-wide text-provider-blue">
            If this round closes
          </h4>
          <p className="mt-3 font-body text-base leading-relaxed text-black">
            At <strong>{fmtUSD(checkSize, true)}</strong> on a <strong>{fmtUSD(postMoneyCap, true)} post-money cap</strong>{' '}
            ({fmtUSD(preMoneyEquiv, true)} pre-money equiv), the investor takes{' '}
            <strong>{fmtPct(newInvestorPct)}</strong> at conversion. Mene retains{' '}
            <strong>{fmtPct(founderPctPostPreSeed)}</strong> post-pre-seed and{' '}
            <strong>{fmtPct(founderPctPostSeedA)}</strong> post-Series A (assuming {fmtPct(seriesADilution, 0)} A
            dilution; ESOP refreshes excluded). Runway extends to <strong>{runwayPhrase}</strong> at current burn — {milestonePhrase} 1 paid
            pilot + 60 days of data. Cap implies a{' '}
            <strong>{impliedArrMultiple.toFixed(1)}× multiple</strong> on the $500K seed ARR target; valuation is{' '}
            <strong>{vFit.label.toLowerCase()}</strong> against {mode} post-money seed comps.
          </p>
        </div>
      </section>
    </div>
  );
}
