"use client";

import Image from "next/image";
import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, type MouseEvent } from "react";

export function HeroVisual({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // Cursor tilt
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [12, -12]), {
    stiffness: 150,
    damping: 15,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-12, 12]), {
    stiffness: 150,
    damping: 15,
  });

  // Scroll parallax + slow spin
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [40, -70]);
  const rotate = useTransform(scrollYProgress, [0, 1], [-6, 8]);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-md lg:max-w-none">
      {/* glow puck behind the dish */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-6 rounded-full bg-gold-400/25 blur-3xl"
      />
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ y, rotate, rotateX, rotateY, transformPerspective: 900 }}
        className="relative aspect-square w-full"
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 45vw, 85vw"
          className="object-contain drop-shadow-2xl"
          priority
        />
      </motion.div>
    </div>
  );
}
