"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The shop's furniture — header, status banner, cart button, chat widget,
 * footer — shown everywhere except HQ, which brings its own sidebar.
 *
 * This decision has to live in a client component, and the reason is the whole
 * point of the fix. The root layout wraps every route, so it looks like the
 * natural place to ask "am I in HQ?" — but a shared layout is rendered once
 * and then *kept* across client-side navigation. Ask it on the shop and the
 * answer is "no"; walk into HQ from a link and nobody asks again, so the
 * shop's header comes along and sits on top of the sidebar. That is exactly
 * what happened.
 *
 * `usePathname` re-reads on every navigation, including the ones that never
 * touch the server, and it is correct during server rendering too — so a hard
 * load of an HQ page never paints the shop chrome even for a frame.
 *
 * Server components pass through as `children` untouched; this only decides
 * whether they are rendered.
 */
export function ShopChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return <>{children}</>;
}
