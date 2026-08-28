"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

type FaqItem = { question: string; answer: string };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => {
        const open = openIndex === index;
        return (
          <div
            key={item.question}
            className={`overflow-hidden rounded-2xl border-2 transition-colors ${
              open ? "border-brand-600 bg-cream-100" : "border-ink-950/10 bg-cream-100/60"
            }`}
          >
            <button
              onClick={() => setOpenIndex(open ? null : index)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-display text-lg font-bold text-ink-950"
              aria-expanded={open}
            >
              {item.question}
              <motion.span
                animate={{ rotate: open ? 135 : 0 }}
                transition={{ duration: 0.25 }}
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg leading-none ${
                  open ? "bg-brand-600 text-cream-50" : "bg-ink-950/10 text-ink-800"
                }`}
              >
                +
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="px-6 pb-5 text-ink-800/80">{item.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
