import { useState } from 'react';

interface PanelData {
  title: string;
  description: string;
  gradient: string;
}

const panels: PanelData[] = [
  {
    title: 'Real people handling the work that matters',
    description:
      'Our remote expeditors integrate with your discharge team, handling insurance verifications, prior authorizations, DME coordination, and facility placements — so your clinical staff can focus on patient care.',
    gradient: 'from-provider-blue to-provider-blue-dark',
  },
  {
    title: 'AI learns from every action taken',
    description:
      'Every discharge our team processes feeds our AI engine. Over time, SENSOCEL automates the most repetitive workflows — reducing turnaround times and scaling capacity without adding headcount.',
    gradient: 'from-provider-blue-dark to-payer-slate',
  },
];

export default function ExpeditorPanels() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <section className="bg-off-white py-20 md:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <span
          className="inline-block rounded-full bg-patient-moss/15 px-4 py-1.5 text-base font-semibold text-patient-moss"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Solution
        </span>

        <h2
          className="mt-6 max-w-3xl text-[32px] leading-tight font-bold text-black md:text-[44px] md:leading-tight"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Expeditor bandwidth on demand.
        </h2>

        <div className="mt-16 flex flex-col gap-6 md:flex-row">
          {panels.map((panel, i) => {
            const isHovered = hoveredIndex === i;
            const siblingHovered = hoveredIndex !== null && hoveredIndex !== i;

            return (
              <div
                key={i}
                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${panel.gradient} cursor-pointer transition-all duration-300 ease-out`}
                style={{
                  flex: isHovered ? '2 1 0%' : siblingHovered ? '1 1 0%' : '1 1 0%',
                  minHeight: '400px',
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div className="absolute inset-0 bg-black/20" />
                <div className="relative flex h-full flex-col justify-end p-8 md:p-10">
                  <h3
                    className="text-xl font-bold text-white md:text-[22px]"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {panel.title}
                  </h3>
                  <p
                    className={`mt-4 text-base text-white/80 transition-all duration-300 ${
                      isHovered ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0 md:max-h-0 md:opacity-0'
                    } overflow-hidden`}
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {panel.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
