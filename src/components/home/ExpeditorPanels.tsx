import { useState, useEffect } from 'react';

interface PanelData {
  title: string;
  description: string;
  image: string;
  imagePosition: string;
}

const panels: PanelData[] = [
  {
    title: 'Real people handling the work that matters',
    description:
      'Our remote expeditors integrate with your discharge team, handling insurance verifications, prior authorizations, DME coordination, and facility placements — so your clinical staff can focus on patient care.',
    image: '/images/Gemini_Generated_Image_ (2).png',
    imagePosition: 'center center',
  },
  {
    title: 'AI learns from every action taken',
    description:
      'Every discharge our team processes feeds our AI engine. Over time, SENSOCEL automates the most repetitive workflows — reducing turnaround times and scaling capacity without adding headcount.',
    image: '/images/Gemini_Generated_Image_ (7).png',
    imagePosition: 'right center',
  },
];

export default function ExpeditorPanels() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
            const showDescription = isMobile || isHovered;

            return (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 ease-out"
                style={{
                  flex: isHovered ? '2 1 0%' : siblingHovered ? '1 1 0%' : '1 1 0%',
                  minHeight: '400px',
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Background image */}
                <div
                  className="absolute inset-0 bg-cover transition-transform duration-500 ease-out"
                  style={{
                    backgroundImage: `url("${panel.image}")`,
                    backgroundPosition: panel.imagePosition,
                    transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                  }}
                />
                {/* Dark overlay for text legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="relative flex h-full flex-col justify-end p-8 md:p-10">
                  <h3
                    className="text-xl font-bold text-white md:text-[22px]"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {panel.title}
                  </h3>
                  <p
                    className="mt-4 overflow-hidden text-base text-white/80 transition-all duration-300"
                    style={{
                      fontFamily: 'var(--font-body)',
                      maxHeight: showDescription ? '10rem' : '0',
                      opacity: showDescription ? 1 : 0,
                    }}
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
