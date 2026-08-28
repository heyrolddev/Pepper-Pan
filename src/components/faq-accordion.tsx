"use client";

import { useState } from "react";

type FaqItem = { question: string; answer: string };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col divide-y divide-brand-200/60 rounded-xl border border-brand-200/60 bg-white/60 dark:divide-brand-800 dark:border-brand-800 dark:bg-brand-900/60">
      {items.map((item, index) => {
        const open = openIndex === index;
        return (
          <div key={item.question}>
            <button
              onClick={() => setOpenIndex(open ? null : index)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium text-brand-950 dark:text-brand-50"
              aria-expanded={open}
            >
              {item.question}
              <span
                className={`shrink-0 text-brand-700 transition-transform dark:text-brand-300 ${open ? "rotate-45" : ""}`}
              >
                +
              </span>
            </button>
            {open && (
              <p className="px-5 pb-4 text-brand-800/80 dark:text-brand-100/70">
                {item.answer}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
