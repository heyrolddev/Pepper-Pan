"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { SignOutButton } from "@/components/sign-out-button";

export function Nav({ userEmail }: { userEmail: string | null }) {
  const { count } = useCart();

  return (
    <header className="border-b border-amber-200/60 dark:border-neutral-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight text-amber-900 dark:text-amber-100"
        >
          Pepper Pan
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-amber-800 dark:text-amber-200">
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
              className="rounded-full bg-amber-900 px-4 py-2 text-amber-50 transition-colors hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
