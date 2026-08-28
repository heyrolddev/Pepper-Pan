"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { SignOutButton } from "@/components/sign-out-button";

export function Nav({ userEmail }: { userEmail: string | null }) {
  const { count } = useCart();

  return (
    <header className="sticky top-0 z-10 border-b border-brand-200/60 bg-brand-50/80 backdrop-blur dark:border-brand-800 dark:bg-brand-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight text-brand-900 dark:text-brand-100"
        >
          Pepper Pan
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-brand-800 dark:text-brand-200">
          {userEmail && (
            <Link href="/orders" className="hover:underline">
              My orders
            </Link>
          )}
          <Link href="/cart" className="hover:underline">
            Cart{count > 0 && ` (${count})`}
          </Link>
          {userEmail ? (
            <SignOutButton />
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-brand-900 px-4 py-2 text-brand-50 transition-colors hover:bg-brand-800 dark:bg-brand-100 dark:text-brand-950 dark:hover:bg-brand-200"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
