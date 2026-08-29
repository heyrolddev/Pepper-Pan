"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState, type FormEvent } from "react";
import { useCart } from "@/lib/cart-context";
import { SignOutButton } from "@/components/sign-out-button";
import { Logo } from "@/components/logo";

const links = [
  { href: "/menu", label: "Menu" },
  { href: "/#story", label: "Story" },
  { href: "/#visit", label: "Visit" },
];

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function NavSearch({ linkClass }: { linkClass: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/menu?q=${encodeURIComponent(q)}` : "/menu");
    setOpen(false);
    setValue("");
  }

  return (
    <>
      <button
        type="button"
        aria-label="Search the menu"
        onClick={() => {
          setOpen((o) => !o);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={`rounded-full p-2 transition-colors ${linkClass}`}
      >
        <SearchIcon className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-x-0 top-full overflow-hidden border-t border-ink-950/10 bg-cream-50 shadow-lg shadow-ink-950/10"
          >
            <form
              onSubmit={submit}
              className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4"
            >
              <SearchIcon className="h-5 w-5 shrink-0 text-ink-800/50" />
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Search for noodles, milktea, ji pai…"
                className="w-full bg-transparent text-base font-medium text-ink-950 outline-none placeholder:text-ink-800/40"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-700"
              >
                Search
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

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
      } relative`}
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

          <NavSearch linkClass={linkClass} />

          {staff && (
            <Link
              href="/admin"
              className={`rounded-full px-3 py-2 font-bold transition-colors ${
                scrolled ? "text-brand-600 hover:text-brand-700" : "text-gold-400 hover:text-gold-300"
              }`}
            >
              Admin
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
