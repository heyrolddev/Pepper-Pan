"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { SignOutButton } from "@/components/sign-out-button";
import { Logo } from "@/components/logo";
import { ChefHatIcon } from "@/components/icons";

/**
 * Only what someone is here to *do*.
 *
 * Story and Visit are worth reading once and never again, and they already sit
 * in the footer where that kind of thing belongs. Keeping them up here cost
 * two slots in a row that has to hold a cart, an order count, a name and a way
 * out — and it pushed the full row past the width of a laptop.
 */
const links = [
  { href: "/menu", label: "Menu" },
  { href: "/reviews", label: "Reviews" },
];

/**
 * One shared shape for every count in the header.
 *
 * The old badge was a fixed 20px circle, which fits "4" and bursts at "12" —
 * the digits spilled over the edge of their own dot. A pill that is at least
 * as wide as it is tall grows with the number instead, and tabular figures
 * keep it from jittering as the count changes.
 */
function countClass(tone: string) {
  return `grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums text-white ${tone}`;
}

/** Past 99 the exact number stops being useful and starts breaking the row. */
function countLabel(n: number) {
  return n > 99 ? "99+" : String(n);
}

/**
 * The gold rule under whichever tab you're on.
 *
 * One shared `layoutId` across every tab, so Motion slides the same underline
 * from the old tab to the new one rather than crossfading two of them. That is
 * also why this is a component and not four copies: the rule has to be one
 * element to travel, and four hand-written copies drift apart the first time
 * one of them is edited.
 */
function ActiveRule() {
  return (
    <motion.span
      layoutId="nav-active"
      className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gold-400"
    />
  );
}

export function Nav({
  signedIn,
  staff,
  name,
  activeOrders = 0,
}: {
  signedIn: boolean;
  staff: boolean;
  name: string | null;
  /** Orders still in flight — badged so a customer can find the countdown. */
  activeOrders?: number;
}) {
  // First name only in the nav — a full name rarely fits, and "Harold" reads
  // more like *their* account than the full legal name would.
  const firstName = (name ?? "").trim().split(/\s+/)[0] || null;
  const { count } = useCart();
  const pathname = usePathname();
  const onAccount = pathname.startsWith("/account");
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
        <Link href="/" aria-label="Pepper Pan — home" className="group block shrink-0">
          <Logo
            priority
            width={220}
            className="h-auto w-[120px] transition-transform duration-300 group-hover:scale-105 sm:w-[150px]"
          />
        </Link>

        {/* Three tiers, and the middle one is measured rather than guessed.
            Under 640px: an order count, the name chip, the cart. From 640 the
            section links join them — a tablet with no way to reach the menu
            is a worse trade than any wrap. The last two, the "My orders" text
            link and sign-out, wait until 880px, because below that the full
            row ran about 860px beside the logo: "Sign out" broke onto two
            lines and the page picked up a sideways scroll. The order count
            still shows the whole way down, as its own pill. */}
        <nav className="flex min-w-0 items-center gap-1.5 text-sm font-semibold sm:gap-2">
          {/* Staff get a deliberately bare header: the owner signed in to run
              the shop, not to browse it, and the HQ badge is the way in. */}
          {!staff &&
            links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative hidden rounded-full px-3 py-2 transition-colors sm:block ${linkClass}`}
            >
              {link.label}
              {pathname === link.href && <ActiveRule />}
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

          {signedIn && !staff && (
            <Link
              href="/orders"
              title={`${activeOrders} order${activeOrders === 1 ? "" : "s"} in progress`}
              className={`relative hidden items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 transition-colors min-[880px]:inline-flex ${linkClass}`}
            >
              My orders
              {activeOrders > 0 && (
                <motion.span
                  key={activeOrders}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                  className={`relative ${countClass("bg-jade-600")}`}
                >
                  {/* A number alone reads as a total — "3 orders", the way the
                      cart badge does. The ring says these are happening *now*,
                      which is the thing worth walking back to the phone for.
                      Behind the digits, so it never obscures them. */}
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-ping rounded-full bg-jade-600 opacity-60"
                  />
                  <span className="relative">{countLabel(activeOrders)}</span>
                </motion.span>
              )}
              {pathname.startsWith("/orders") && <ActiveRule />}
            </Link>
          )}

          {/* On a phone the "My orders" link is hidden for space — but an
              order in progress is exactly what someone opens the site to
              check, so it earns a spot of its own while it's live. */}
          {signedIn && !staff && activeOrders > 0 && (
            <Link
              href="/orders"
              title={`${activeOrders} order${activeOrders === 1 ? "" : "s"} in progress`}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-jade-600 px-2.5 py-1.5 text-xs font-bold text-cream-50 min-[880px]:hidden"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cream-50" />
              {countLabel(activeOrders)}
            </Link>
          )}

          {!staff && (
          <Link
            href="/cart"
            className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 transition-colors ${linkClass}`}
          >
            Cart
            {count > 0 && (
              <motion.span
                key={count}
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 15 }}
                className={countClass("bg-brand-600")}
              >
                {countLabel(count)}
              </motion.span>
            )}
            {pathname === "/cart" && <ActiveRule />}
          </Link>
          )}

          {/* The account chip carries the customer's own name, so the header
              reads as their account rather than a generic "Account" link.
              Being a chip rather than a text link, it can't take the gold rule
              the other tabs use — so on its own page the whole chip goes gold
              instead. Same signal, in the shape this control actually has. */}
          {signedIn && !staff && (
            <Link
              href="/account"
              title="Your account"
              aria-current={onAccount ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-1 font-bold transition-all hover:scale-105 min-[880px]:pr-3 ${
                onAccount
                  ? "bg-gold-400 text-ink-950 ring-2 ring-gold-400"
                  : scrolled
                    ? "bg-ink-950/5 text-ink-950 ring-1 ring-ink-950/10"
                    : "bg-cream-50/10 text-cream-50 ring-1 ring-cream-50/20"
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${
                  onAccount ? "bg-ink-950 text-gold-400" : "bg-brand-600 text-cream-50"
                }`}
              >
                {(firstName ?? "?").charAt(0).toUpperCase()}
              </span>
              <span className="hidden max-w-24 truncate text-xs min-[880px]:block">
                {firstName ?? "Account"}
              </span>
            </Link>
          )}


          {signedIn ? (
            // Hidden on the compact row, where it wrapped to two lines and
            // shoved everything else into the logo.
            // It lives on the account page instead, which is where the
            // account chip beside it already leads.
            <span className="hidden min-[880px]:block">
              <SignOutButton scrolled={scrolled} />
            </span>
          ) : (
            <Link
              href="/login"
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 font-bold transition-colors ${
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
