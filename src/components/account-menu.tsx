"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * The customer's own corner of the header.
 *
 * Three controls used to compete for the right-hand end of the row — the name
 * chip, a "My orders" text link and "Sign out" — and the row could not carry
 * them. Both text links were hidden below 880px, which is most phones, so on
 * the device nearly every customer actually uses, the only way to sign out of
 * this site was to know that the account page has a button on it.
 *
 * So the chip becomes the door. The avatar is the thing a person already
 * reaches for when they want *their* stuff, and behind it sit the two things
 * they want there: their account, and the way out. They stop competing for
 * width and they stop disappearing on a phone.
 *
 * ── The cart is NOT in here, and that is the whole point of the split ────
 *
 * The obvious next move is to sweep the cart in too — it is "theirs", it is
 * right next door, and the row would get shorter again. It would also put a
 * tap between a customer and their basket on every single page, and the cart
 * is the one control on this site whose entire job is to be one tap away.
 * A menu is the right home for things you visit; the cart is a thing you
 * finish. It stays its own button.
 */
export function AccountMenu({
  firstName,
  activeOrders,
  solid,
  onAccountPage,
  countClass,
  countLabel,
}: {
  firstName: string | null;
  activeOrders: number;
  /** Whether the nav is over a light background right now. */
  solid: boolean;
  onAccountPage: boolean;
  /** The header's own badge shape, so this count matches every other one. */
  countClass: (tone: string) => string;
  countLabel: (n: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const pathname = usePathname();

  /* Close when the route changes.

     Without this, tapping "My orders" navigates and leaves the menu hanging
     open over the page you just asked for — the panel is not unmounted by a
     client-side navigation, because nothing about it depends on the route.

     Adjusted during render rather than in an effect. React's own guidance,
     and the linter enforces it here: setting state from an effect renders the
     open menu once, paints it over the new page, and only then closes it. The
     comparison below re-renders before anything reaches the screen. */
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Focus goes back where it came from. A menu that closes into nowhere
      // leaves a keyboard user at the top of the document.
      trigger.current?.focus();
    };

    /* `pointerdown`, not `click`.

       A click listener fires after the mousedown has already moved focus, so
       a tap on a link elsewhere on the page would close the menu on the way
       and — on iOS Safari — sometimes swallow the tap that was meant for the
       link underneath. Pointerdown closes before anything else reacts. */
    const onOutside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
    };
  }, [open]);

  /* Move into the menu when it opens from the keyboard.

     Only when it opened from the keyboard: stealing focus after a tap makes
     a phone keyboard flash up on some browsers, and the thumb is already
     where it needs to be. */
  const openFromKeyboard = useRef(false);
  useEffect(() => {
    if (!open || !openFromKeyboard.current) return;
    openFromKeyboard.current = false;
    panel.current?.querySelector<HTMLElement>("a,button")?.focus();
  }, [open]);

  /**
   * Menu rows, and the one you are standing on.
   *
   * The header's own links say where you are with a gold rule under them. A
   * rule cannot travel into a dropdown — there is nothing to underline once
   * the panel is shut — so the current row carries the same fact in the shape
   * this control has: the brand tint, the darker type, and a gold bar down
   * the left edge where a rule would be if the row were a tab.
   */
  const item =
    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors";
  const itemOff = `${item} text-ink-800 hover:bg-ink-950/[0.06] hover:text-ink-950`;
  const itemOn = `${item} relative bg-brand-600/10 text-ink-950 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-gold-400`;

  /** Reviews is a section; the others are exact pages. */
  const here = (href: string) =>
    href === "/account" ? pathname.startsWith("/account") : pathname.startsWith(href);

  const rows = [
    { href: "/orders", label: "My orders" },
    { href: "/reviews", label: "Reviews" },
    { href: "/account", label: "My account" },
  ];

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            openFromKeyboard.current = true;
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={firstName ? `${firstName} — your account` : "Your account"}
        className={`flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-1 font-bold transition-all hover:scale-105 min-[880px]:pr-2.5 ${
          onAccountPage || open
            ? "bg-brand-600 text-cream-50 ring-2 ring-gold-400"
            : solid
              ? "bg-ink-950/5 text-ink-950 ring-1 ring-ink-950/10"
              : "bg-cream-50/10 text-cream-50 ring-1 ring-cream-50/20"
        }`}
      >
        <span className="relative">
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${
              onAccountPage || open ? "bg-ink-950 text-gold-400" : "bg-brand-600 text-cream-50"
            }`}
          >
            {(firstName ?? "?").charAt(0).toUpperCase()}
          </span>
          {/* A live order is the one thing worth pulling somebody INTO the
              menu, so it has to be visible while the menu is shut. A dot
              rather than the number: the exact count is inside, and a pill
              on a 28px avatar covers the initial it sits on. */}
          {activeOrders > 0 && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-jade-600 ring-2 ring-cream-50"
            />
          )}
        </span>
        <span className="hidden max-w-24 truncate text-xs min-[880px]:block">
          {firstName ?? "Account"}
        </span>
        <span
          aria-hidden
          className={`hidden text-[10px] opacity-50 transition-transform min-[880px]:block ${open ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          ref={panel}
          id={menuId}
          role="menu"
          aria-label="Your account"
          /* Right-aligned and pinned under the chip. `right-0` rather than
             `left-0` because the chip is the last thing in the row — a
             left-aligned panel would hang off the edge of a phone. */
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 rounded-2xl bg-cream-50 p-2 shadow-xl ring-1 ring-ink-950/10"
        >
          {firstName && (
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-black uppercase tracking-wide text-ink-800/40">
              Signed in as {firstName}
            </p>
          )}

          {rows.map((row) => {
            const on = here(row.href);
            return (
              <Link
                key={row.href}
                href={row.href}
                role="menuitem"
                aria-current={on ? "page" : undefined}
                className={on ? itemOn : itemOff}
              >
                {row.label}
                {row.href === "/orders" && activeOrders > 0 ? (
                  <span className={`relative ${countClass("bg-jade-600")}`}>
                    <span
                      aria-hidden
                      className="absolute inset-0 animate-ping rounded-full bg-jade-600 opacity-60"
                    />
                    <span className="relative">{countLabel(activeOrders)}</span>
                  </span>
                ) : on ? (
                  <span className="text-[10px] font-black uppercase tracking-wide text-brand-600">
                    here
                  </span>
                ) : (
                  <span aria-hidden className="text-xs opacity-35">
                    ›
                  </span>
                )}
              </Link>
            );
          })}

          <div className="my-1 h-px bg-ink-950/10" />

          {/* The real sign-out, confirm dialog and all. Rendering it here
              rather than reimplementing the button is what keeps the question
              — and the fixes that dialog has accumulated — in one place. */}
          <div role="menuitem" className="px-1 pb-0.5">
            <SignOutButton variant="menu" />
          </div>
        </div>
      )}
    </div>
  );
}
