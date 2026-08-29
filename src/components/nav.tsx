"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { SignOutButton } from "@/components/sign-out-button";
import { Logo } from "@/components/logo";
import { ChefHatIcon } from "@/components/icons";

const links = [
  { href: "/menu", label: "Menu" },
  { href: "/reviews", label: "Reviews" },
  { href: "/#story", label: "Story" },
  { href: "/#visit", label: "Visit" },
];

export function Nav({ signedIn, staff }: { signedIn: boolean; staff: boolean }) {
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
      // An inset shadow rather than a border, so the nav's box is exactly
      // --nav-h tall and nothing else has to account for a stray pixel.
      // Opaque rather than translucent+blur: a backdrop-filter over
      // scrolling content costs a GPU pass every frame.
      className={`sticky top-0 z-40 transition-colors duration-300 ${
        scrolled
          ? "bg-cream-50 shadow-[inset_0_-1px_0_rgb(28_17_14/0.12)]"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[var(--nav-h)] max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="Pepper Pan — home" className="group block">
          <Logo
            priority
            width={220}
            className="h-auto w-[120px] transition-transform duration-300 group-hover:scale-105 sm:w-[150px]"
          />
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

          {/* Owner/staff marker — deliberately a badge rather than another
              text link, so it's obvious at a glance which account you're in. */}
          {staff && (
            <Link
              href="/admin"
              title="You're signed in as shop staff — open Pepper Pan HQ"
              className={`group flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 font-bold ring-2 transition-all hover:scale-105 ${
                scrolled
                  ? "bg-ink-950 text-gold-400 ring-gold-400/40"
                  : "bg-gold-400 text-ink-950 ring-gold-400/60"
              }`}
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-full ${
                  scrolled ? "bg-gold-400 text-ink-950" : "bg-ink-950 text-gold-400"
                }`}
              >
                <ChefHatIcon className="h-3.5 w-3.5" />
              </span>
              <span className="hidden text-xs uppercase tracking-wide sm:block">
                Owner
              </span>
            </Link>
          )}

          {signedIn && (
            <Link
              href="/account"
              className={`hidden rounded-full px-3 py-2 transition-colors sm:block ${linkClass}`}
            >
              Account
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

          {signedIn ? (
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
