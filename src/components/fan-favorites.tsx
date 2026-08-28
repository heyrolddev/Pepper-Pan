"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";

const MotionLink = motion.create(Link);

type Favorite = { name: string; image: string };

export function FanFavorites({ items }: { items: Favorite[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {items.map((item, i) => (
        <MotionLink
          key={item.name}
          href="/menu"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: i * 0.06 }}
          whileHover={{ scale: 1.04, rotate: i % 2 === 0 ? -1 : 1 }}
          whileTap={{ scale: 0.98 }}
          className="block overflow-hidden rounded-xl border-2 border-brand-950 bg-white shadow-md dark:border-gold-400"
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
        </MotionLink>
      ))}
    </div>
  );
}
