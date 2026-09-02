import { privatePage } from "@/lib/seo";

/**
 * Exists only to carry the noindex tag.
 *
 * The page itself is a client component — it needs state for the form — and a
 * client component cannot export `metadata`. A layout can, and it renders on
 * the server, so this is the one place the tag can go.
 */
export const metadata = privatePage("Sign in");

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
