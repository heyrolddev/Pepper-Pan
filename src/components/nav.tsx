"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { SignOutButton } from "@/components/sign-out-button";
import { AccountMenu } from "@/components/account-menu";
import { Logo } from "@/components/logo";
import { ChefHatIcon } from "@/components/icons";
import { roleLabel } from "@/lib/permissions";

/**
 * One link outside the menu, and it is the food.
 *
 * Story and Visit are worth reading once and never again, and they already sit
 * in the footer where that kind of thing belongs. Reviews went the other way —
 * into the account menu — because it is something a customer visits, and the
 * header is for the two things they DO: look at the dishes, and pay for them.
 *
 * So Menu sits beside Cart, and the pair is the whole journey. It is also no
 * longer hidden below 640px, which it was: on a phone, the header of a food
 * shop offered a cart and no way to reach the food.
 */
const links = [{ href: "/menu", label: "Menu" }];

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
  role,
  name,
  activeOrders = 0,
}: {
  signedIn: boolean;
  staff: boolean;
  /**
   * Which job, not just "one of ours". The badge used to read "Owner" for
   * everyone who worked here, so every member of staff was shown a title that
   * belonged to somebody else.
   */
  role?: string | null;
  name: string | null;
  /** Orders still in flight — badged so a customer can find the countdown. */
  activeOrders?: number;
}) {
  // First name only in the nav — a full name rarely fits, and "Harold" reads
  // more like *their* account than the full legal name would.
  const firstName = (name ?? "").trim().split(/\s+/)[0] || null;
  const { count } = useCart();
  const pathname = usePathname();
  /**
   * The chip is "on" for everything behind it, not only /account.
   *
   * Three pages live in that menu now — the account, the orders and the
   * reviews — so a chip that only lit up on one of them told you nothing
   * about where you were on the other two, and they have no other marker in
   * the header at all.
   */
  const onAccount =
    pathname.startsWith("/account") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/reviews");
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 24);
  });

  /**
   * Whether the nav is floating over something dark right now.
   *
   * This used to be `!solid`, on the assumption — written into the comment
   * that was here — that every page opens with a dark hero. That stopped
   * being true, and it fails in the worst way available: pale cream type on a
   * cream page. On a news post the Sign out button was present, clickable and
   * completely invisible.
   *
   * So the pale treatment is opt-in now and the solid one is the default,
   * chosen on how the two fail. Defaulting to solid on a page that does have
   * a dark hero looks slightly early. Defaulting to pale on a page that does
   * not makes controls vanish. Only one of those is a bug, and a page added
   * next year gets the safe answer without anybody remembering this comment.
   *
   * `solid` rather than `solid` everywhere below, because that is the
   * question each of those colours is actually asking.
   */
  const solid = scrolled || pathname !== "/";

  const linkClass = solid
    ? "text-ink-800 hover:text-brand-600"
    : "text-cream-100/80 hover:text-gold-400";

  /**
   * The page you are on, in the type as well as under it.
   *
   * The gold rule alone is two pixels of colour at the bottom edge of a
   * control, which is enough on a laptop and disappears on a phone held at
   * arm's length over a hot pan. Darkening the label as well costs nothing and
   * means the current page reads as current before you look for the underline.
   */
  const activeClass = solid ? "text-ink-950" : "text-cream-50";

  return (
    <header
      // An inset shadow rather than a border, so the nav's box is exactly
      // --nav-h tall and nothing else has to account for a stray pixel.
      // Opaque rather than translucent+blur: a backdrop-filter over
      // scrolling content costs a GPU pass every frame.
      className={`sticky top-0 z-40 transition-colors duration-300 ${
        solid
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
        <nav className="flex min-w-0 items-center gap-1 text-sm font-semibold sm:gap-2">
          {/* Staff get a deliberately bare header: the owner signed in to run
              the shop, not to browse it, and the HQ badge is the way in. */}
          {!staff &&
            links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`relative shrink-0 rounded-full px-2.5 py-2 transition-colors sm:px-3 ${linkClass} ${
                  pathname === link.href ? activeClass : ""
                }`}
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
                solid
                  ? "bg-ink-950 text-gold-400 ring-gold-400/40"
                  : "bg-brand-600 text-cream-50 ring-gold-400/60"
              }`}
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-full ${
                  solid ? "bg-brand-600 text-cream-50" : "bg-ink-950 text-gold-400"
                }`}
              >
                <ChefHatIcon className="h-3.5 w-3.5" />
              </span>
              <span className="hidden text-xs uppercase tracking-wide sm:block">
                {roleLabel(role)}
              </span>
            </Link>
          )}

          {/* An order in flight keeps its own pill, outside the menu.

              "My orders" as a text link moved INTO the account menu, where it
              belongs — but a live order is not navigation, it is a countdown,
              and it is the single thing somebody opens this site to check. A
              live order one tap away is worth the width; the link to a list of
              finished ones is not. */}
          {signedIn && !staff && activeOrders > 0 && (
            <Link
              href="/orders"
              title={`${activeOrders} order${activeOrders === 1 ? "" : "s"} in progress`}
              className="relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-jade-600 px-2.5 py-1.5 text-xs font-bold text-cream-50"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cream-50" />
              {countLabel(activeOrders)}
              <span className="hidden min-[880px]:inline">
                {activeOrders === 1 ? "order" : "orders"} cooking
              </span>
              {pathname.startsWith("/orders") && <ActiveRule />}
            </Link>
          )}

          {!staff && (
          <Link
            href="/cart"
            aria-current={pathname === "/cart" ? "page" : undefined}
            className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2 transition-colors sm:px-3 ${linkClass} ${
              pathname === "/cart" ? activeClass : ""
            }`}
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

          {/* The chip carries the customer's own name, so the header reads as
              their account rather than a generic "Account" link — and it is
              now the door to everything of theirs except the cart. See
              `account-menu.tsx` for why the cart is deliberately left out. */}
          {signedIn && !staff && (
            <AccountMenu
              firstName={firstName}
              activeOrders={activeOrders}
              solid={solid}
              onAccountPage={onAccount}
              countClass={countClass}
              countLabel={countLabel}
            />
          )}

          {/* Staff keep the plain button. HQ has its own sidebar with a sign
              out in it, the header is not where they live, and an account
              menu offering a customer's order history to the owner would be
              two products in one control. */}
          {signedIn && staff && (
            <span className="hidden min-[880px]:block">
              <SignOutButton solid={solid} />
            </span>
          )}

          {!signedIn && (
            <Link
              href="/login"
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 font-bold transition-colors ${
                solid
                  ? "bg-ink-950 text-cream-50 hover:bg-brand-600"
                  : "bg-brand-600 text-cream-50 hover:bg-brand-700"
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
