"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { SignOutButton } from "@/components/sign-out-button";

const links = [
  { href: "/menu", label: "Menu" },
  { href: "/#story", label: "Story" },
  { href: "/#visit", label: "Visit" },
];

export function Nav({ userEmail }: { userEmail: string | null }) {
  const { count } = useCart();
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 24);
  });

  // Every page opens with a dark hero/masthead, so the transparent
  // (unscrolled) nav sits on dark and needs light type; once it gains its
  // cream background on scroll it flips to dark type.
  const linkClass = scrolled
    ? "text-ink-800 hover:text-brand-600"
    : "text-cream-100/80 hover:text-gold-400";

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? "border-b border-ink-950/10 bg-cream-50/90 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between px-6 transition-all duration-300 ${
          scrolled ? "py-3" : "py-5"
        }`}
      >
        <Link href="/" className="group flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 font-display text-lg font-black text-gold-400 transition-transform group-hover:rotate-12">
            P
          </span>
          <span
            className={`font-display text-xl font-black tracking-tight transition-colors ${
              scrolled ? "text-ink-950" : "text-cream-50"
            }`}
          >
            Pepper Pan
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm font-semibold sm:gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative hidden rounded-full px-3 py-2 transition-colors sm:block ${linkClass}`}
            >
              {link.label}
              {pathname === link.href && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gold-400"
                />
              )}
            </Link>
          ))}

          {userEmail && (
            <Link
              href="/orders"
              className={`rounded-full px-3 py-2 transition-colors ${linkClass}`}
            >
              Orders
            </Link>
          )}

          <Link
            href="/cart"
            className={`relative rounded-full px-3 py-2 transition-colors ${linkClass}`}
          >
            Cart
            {count > 0 && (
              <motion.span
                key={count}
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 15 }}
                className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white"
              >
                {count}
              </motion.span>
            )}
          </Link>

          {userEmail ? (
            <SignOutButton scrolled={scrolled} />
          ) : (
            <Link
              href="/login"
              className={`rounded-full px-4 py-2 font-bold transition-colors ${
                scrolled
                  ? "bg-ink-950 text-cream-50 hover:bg-brand-600"
                  : "bg-gold-400 text-ink-950 hover:bg-gold-300"
              }`}
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
