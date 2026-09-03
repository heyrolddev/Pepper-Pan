"use client";

import { motion } from "motion/react";

type Tile = {
  number: string;
  label: string;
  detail: string;
  tone: "red" | "gold" | "ink" | "cream";
};

const toneClasses: Record<Tile["tone"], string> = {
  red: "bg-brand-600 text-cream-50",
  gold: "bg-gold-400 text-ink-950",
  ink: "bg-ink-950 text-cream-50",
  cream: "bg-cream-100 text-ink-950 ring-2 ring-inset ring-ink-950",
};

export function WhyUs({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((tile, i) => (
        <motion.div
          key={tile.number}
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -8, rotate: i % 2 === 0 ? -1.5 : 1.5 }}
          className={`grain relative flex flex-col gap-2 overflow-hidden rounded-3xl p-6 ${toneClasses[tile.tone]}`}
        >
          <span className="font-display text-4xl font-black opacity-25">
            {tile.number}
          </span>
          <span className="font-display text-xl font-bold leading-tight">
            {tile.label}
          </span>
          <span className="text-sm opacity-80">{tile.detail}</span>
        </motion.div>
      ))}
    </div>
  );
}
