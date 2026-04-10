import { useState, useCallback } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

interface AccordionFAQProps {
  items: FAQItem[];
  singleOpen?: boolean;
}

export default function AccordionFAQ({ items, singleOpen = true }: AccordionFAQProps) {
  const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());

  const toggle = useCallback((index: number) => {
    setOpenIndices((prev) => {
      const next = new Set(singleOpen ? [] : prev);
      if (prev.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, [singleOpen]);

  return (
    <div className="divide-y divide-[#D9DADC]" role="list">
      {items.map((item, i) => {
        const isOpen = openIndices.has(i);
        return (
          <div key={i} role="listitem">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 py-6 text-left focus:outline-2 focus:outline-offset-2 focus:outline-[#DEAC31]"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${i}`}
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              <span className="text-lg font-bold text-[#020306] md:text-xl">
                {item.question}
              </span>
              <svg
                className={`h-5 w-5 shrink-0 text-[#454A53] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            <div
              id={`faq-answer-${i}`}
              role="region"
              className="overflow-hidden transition-all duration-200"
              style={{
                maxHeight: isOpen ? '500px' : '0',
                opacity: isOpen ? 1 : 0,
              }}
            >
              <p
                className="pb-6 text-base leading-relaxed text-[#454A53] md:text-lg"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {item.answer}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
