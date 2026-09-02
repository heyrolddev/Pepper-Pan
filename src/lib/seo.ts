import type { Metadata } from "next";

/**
 * Keep a page out of search results.
 *
 * `robots.txt` already asks crawlers not to fetch these, but that is a request
 * not to *read* the page — it is not a request to leave it out of the index.
 * A page someone links to from Facebook can still appear as a bare URL with no
 * description, because the crawler obeyed robots.txt, never read the page, and
 * had nothing to show. This tag is the one that actually says "do not list
 * this", and the two together cover both halves.
 *
 * Applied to the checkout, the cart, the account, order history and every HQ
 * page. None of them are secret — they are all behind an auth check already —
 * they are simply not pages anybody should arrive at from a search.
 */
export function privatePage(title: string): Metadata {
  return {
    title,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}
