"use client";

import { motion } from "motion/react";

type Tile = { number: string; label: string; detail: string; tone: "red" | "gold" | "charcoal" | "cream" };

const toneClasses: Record<Tile["tone"], string> = {
  red: "bg-brand-600 text-white",
  gold: "bg-gold-400 text-brand-950",
  charcoal: "bg-brand-950 text-white",
  cream: "bg-white text-brand-950 border-2 border-brand-600",
};

export function WhyUs({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((tile, i) => (
        <motion.div
          key={tile.number}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: i * 0.08 }}
          whileHover={{ y: -6, scale: 1.03 }}
          className={`flex flex-col gap-2 rounded-2xl p-5 shadow-sm ${toneClasses[tile.tone]}`}
        >
          <span className="text-xs font-semibold opacity-70">№{tile.number}</span>
          <span className="text-lg font-semibold leading-tight">{tile.label}</span>
          <span className="text-sm opacity-80">{tile.detail}</span>
        </motion.div>
      ))}
    </div>
  );
}
