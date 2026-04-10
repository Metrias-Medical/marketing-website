import Grainient from '../reactbits/Grainient';

export default function HeroGrainient() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Grainient
          color1="#253780"
          color2="#1D2C66"
          color3="#DEAC31"
          grainAmount={0.08}
          contrast={1.3}
          saturation={0.85}
          warpStrength={0.6}
          timeSpeed={0.15}
          warpFrequency={3.0}
        />
      </div>

      <div className="relative z-10 flex flex-col">
        {/* Hero content */}
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-32 text-center lg:py-40">
          <h1
            className="mx-auto max-w-4xl text-[44px] leading-tight font-bold text-white md:text-[72px] md:leading-none"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Discharge bottlenecks end here
          </h1>
          <p
            className="mx-auto mt-6 max-w-2xl text-lg text-white/90 md:text-xl"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Metrias deploys remote experts with proprietary software to clear
            hospital discharge delays — accelerating patient flow, recovering
            revenue, and freeing clinical staff.
          </p>
        </div>

        {/* CTA Banner — shares the Grainient background */}
        <div className="flex flex-col items-center gap-6 px-6 pb-24 text-center md:pb-32">
          <h2
            className="max-w-3xl text-[32px] leading-tight font-bold text-white md:text-[44px] md:leading-tight"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Solve Hospital Discharge Throughput Now
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row">
            <a
              href="mailto:contact@metriasmedical.com?subject=Contact%20Request"
              className="rounded-lg border-2 border-white/80 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-white/10"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Contact
            </a>
            <a
              href="mailto:contact@metriasmedical.com?subject=Demo%20Request"
              className="rounded-lg bg-[#DEAC31] px-8 py-3 text-base font-medium text-[#253780] transition-colors hover:bg-[#DEAC31]/90"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Request Demo
            </a>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 animate-bounce">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-60"
        >
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
      </div>
    </section>
  );
}
