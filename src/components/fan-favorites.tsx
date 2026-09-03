"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";

const MotionLink = motion.create(Link);

type Favorite = { name: string; image: string };

export function FanFavorites({ items }: { items: Favorite[] }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
      {items.map((item, i) => (
        <MotionLink
          key={item.name}
          href="/menu"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ scale: 1.05, rotate: i % 2 === 0 ? -1.5 : 1.5 }}
          whileTap={{ scale: 0.98 }}
          className="group relative block overflow-hidden rounded-2xl ring-1 ring-ink-950/10 transition-shadow hover:shadow-xl hover:shadow-brand-600/15"
        >
          <div className="relative aspect-[3/4] w-full">
            <Image
              src={item.image}
              alt={item.name}
              fill
              sizes="(min-width: 640px) 33vw, 50vw"
              className="object-cover"
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-ink-950 via-ink-950/80 to-transparent px-4 pb-4 pt-10 transition-transform duration-300 group-hover:translate-y-0">
            <span className="font-display text-lg font-bold text-cream-50">
              {item.name}
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-gold-400">
              Order now →
            </span>
          </div>
        </MotionLink>
      ))}
    </div>
  );
}
