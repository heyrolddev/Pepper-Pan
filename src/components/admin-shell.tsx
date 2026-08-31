"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import type { AdminBadges } from "@/lib/admin-badges";
import { SignOutButton } from "@/components/sign-out-button";
import { useOrderRealtime } from "@/lib/use-order-realtime";

/**
 * HQ as a workspace rather than a web page.
 *
 * A row of pills across the top has a hard ceiling: it can only hold what fits
 * on one line, so every new screen either shrinks the others or gets hidden
 * behind a breakpoint. A sidebar has no such ceiling — it grows downward,
 * which is free — and it does something the pills couldn't: show where you are
 * inside the whole system, not just which pill is lit.
 *
 * Same shape on both, which is the point. On a desktop the rail is always
 * there. On a phone the identical rail slides in over the page, so the owner
 * learns one layout and finds the same thing in the same place on the counter
 * tablet and in their hand.
 */

type Item = {
  href: string;
  label: string;
  icon: string;
  /** Which count in `badges` belongs on this row, if any. */
  badge?: keyof AdminBadges;
  /**
   * Hidden from staff entirely, rather than shown and then refused.
   * A row that exists only to say "you can't" is a worse answer than a row
   * that isn't there — and the pages themselves still check, because hiding a
   * link has never been a permission.
   */
  ownerOnly?: boolean;
};
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Every day",
    items: [
      { href: "/admin", label: "Today", icon: "◉" },
      { href: "/admin/counter", label: "Counter", icon: "◫" },
      { href: "/admin/orders", label: "Orders", icon: "▤", badge: "orders" },
      { href: "/admin/menu", label: "Menu", icon: "☰" },
      { href: "/admin/inbox", label: "Inbox", icon: "✉", badge: "inbox" },
    ],
  },
  {
    // The half of the business that had software written for it in the very
    // first migration and no screen until now: fourteen tables of recipes,
    // ingredients and costs that nothing in the app ever read.
    title: "The kitchen",
    items: [
      { href: "/admin/costing", label: "Dish costs", icon: "◍", ownerOnly: true },
      { href: "/admin/inventory", label: "Inventory", icon: "▢" },
    ],
  },
  {
    title: "Understand",
    items: [
      { href: "/admin/analytics", label: "Analytics", icon: "◈" },
      { href: "/admin/reviews", label: "Reviews", icon: "★" },
      { href: "/admin/customers", label: "Customers", icon: "◑" },
      { href: "/admin/faq", label: "Answers", icon: "?" },
    ],
  },
  {
    title: "Set up once",
    items: [
      { href: "/admin/hours", label: "Hours", icon: "◷" },
      { href: "/admin/delivery", label: "Delivery", icon: "→" },
      { href: "/admin/payments", label: "Payments", icon: "₱", badge: "payments" },
      { href: "/admin/alerts", label: "Alerts", icon: "🔔" },
    ],
  },
  {
    // Split out of "Set up once", because neither of these is done once:
    // a backup is only worth anything if it keeps happening.
    title: "Your data",
    items: [
      { href: "/admin/backup", label: "Backup", icon: "⤓", ownerOnly: true },
      { href: "/admin/reset", label: "Start fresh", icon: "⟲", ownerOnly: true },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

/** "/admin" only matches itself; everything else matches its subpages too. */
function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export function currentTitle(pathname: string): string {
  // Longest match wins, so /admin/orders doesn't answer to /admin.
  const hit = [...ALL]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => isActive(pathname, i.href));
  return hit?.label ?? "HQ";
}

/**
 * The count on a row, in the one place it's defined.
 *
 * Gold on the active row and brand red elsewhere, because the active row's
 * own background is already gold — a gold pill on gold is invisible, which is
 * the one thing a badge may never be.
 */
function Badge({ n, active }: { n: number; active: boolean }) {
  if (n <= 0) return null;
  return (
    <span
      className={`ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-black tabular-nums ${
        active ? "bg-ink-950 text-gold-400" : "bg-brand-600 text-cream-50"
      }`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function Rail({
  pathname,
  onNavigate,
  email,
  role,
  badges,
  connected,
}: {
  pathname: string;
  onNavigate?: () => void;
  email: string;
  role: string;
  badges: AdminBadges;
  connected: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto bg-ink-950 px-4 py-6">
      <Link href="/admin" onClick={onNavigate} className="px-2">
        <Logo width={130} className="h-auto w-[130px]" />
        <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-gold-400">
          {role === "owner" ? "Owner" : "Staff"} · HQ
        </p>
      </Link>

      <nav className="flex flex-1 flex-col gap-6">
        {GROUPS.map((group) => ({
          ...group,
          items: group.items.filter((i) => !i.ownerOnly || role === "owner"),
        }))
          .filter((group) => group.items.length > 0)
          .map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-cream-100/30">
              {group.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                        active
                          ? "bg-gold-400 text-ink-950"
                          : "text-cream-100/70 hover:bg-cream-50/10 hover:text-cream-50"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`w-4 shrink-0 text-center text-xs ${
                          active ? "opacity-70" : "opacity-40"
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0 truncate">{item.label}</span>
                      <Badge
                        n={item.badge ? badges[item.badge] : 0}
                        active={active}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-cream-50/10 pt-4">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-cream-100/70 transition-colors hover:bg-cream-50/10 hover:text-cream-50"
        >
          <span aria-hidden className="w-4 shrink-0 text-center text-xs opacity-40">
            ↗
          </span>
          View shop
        </Link>
        <p className="truncate px-3 pb-1 pt-3 text-[11px] text-cream-100/35">
          {email}
        </p>
        {/* Says whether the counts above can be trusted to be current. A
            sidebar that quietly stopped updating looks exactly like a quiet
            afternoon. */}
        <p className="flex items-center gap-2 px-3 pb-1 text-[11px] text-cream-100/35">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "animate-pulse bg-jade-400" : "bg-cream-100/25"
            }`}
          />
          {connected ? "Live" : "Reconnecting…"}
        </p>
        {/* Last thing in the rail, under the account it signs out of. HQ had
            no way out at all — the only sign-out lived in the shop header,
            which the rail replaces, so leaving HQ meant leaving HQ first. */}
        <SignOutButton variant="rail" />
      </div>
    </div>
  );
}

export function AdminShell({
  children,
  email,
  role,
  badges,
}: {
  children: React.ReactNode;
  email: string;
  role: string;
  badges: AdminBadges;
}) {
  const pathname = usePathname();
  const waiting = badges.orders + badges.inbox + badges.payments;

  // Subscribed here, in the shell, so *every* HQ screen stays current — and
  // with it the counts in the rail, which are fetched by the layout this sits
  // in. It used to live only in the orders banner, which is on two pages: the
  // owner could sit on Payments while three orders came in and the rail would
  // go on saying nothing until they navigated.
  const { connected } = useOrderRealtime({ channelKey: "shell" });
  // The drawer remembers which page it was opened on, and is only open while
  // that's still the page. Derived rather than synchronised: every link
  // already closes it on click, but the back button changes the path without
  // one, and a drawer left hanging over the new page is disorienting.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (next: boolean) => setOpenedOn(next ? pathname : null);

  // A drawer that traps you is worse than no drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenedOn(null);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex min-h-screen bg-cream-50">
      {/* Desktop rail — always there, never in the way. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">
        <Rail
          pathname={pathname}
          email={email}
          role={role}
          badges={badges}
          connected={connected}
        />
      </aside>

      {/* Phone drawer — the same rail, over the page. */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink-950/60"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <Rail
              pathname={pathname}
              email={email}
              role={role}
              badges={badges}
              connected={connected}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone bar. It says where you are, because without the rail in view
            a page of numbers doesn't tell you which page it is. */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-ink-950/10 bg-cream-50/95 px-4 py-3 backdrop-blur lg:hidden">
          {/* On a phone the rail is behind this button, so every badge inside
              it is invisible until someone thinks to look. The count comes out
              onto the button itself: the whole point was answering "is there
              anything for me?" without opening anything. */}
          <button
            onClick={() => setOpen(true)}
            aria-label={
              waiting > 0
                ? `Open menu — ${waiting} thing${waiting === 1 ? "" : "s"} need you`
                : "Open menu"
            }
            aria-expanded={open}
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-cream-50"
          >
            <span aria-hidden className="text-lg leading-none">
              ☰
            </span>
            {waiting > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-black tabular-nums text-cream-50 ring-2 ring-cream-50">
                {waiting > 99 ? "99+" : waiting}
              </span>
            )}
          </button>
          <p className="min-w-0 flex-1 truncate font-display text-lg font-black text-ink-950">
            {currentTitle(pathname)}
          </p>
          <Link
            href="/"
            className="shrink-0 rounded-full bg-ink-950/5 px-3 py-1.5 text-xs font-bold text-ink-950 ring-1 ring-ink-950/10"
          >
            Shop ↗
          </Link>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
