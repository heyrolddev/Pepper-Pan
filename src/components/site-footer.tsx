"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Marquee } from "@/components/marquee";
import { Logo } from "@/components/logo";
import { SocialLinks } from "@/components/social-links";

/**
 * The shop's public footer.
 *
 * Hidden on /admin: the owner signs in to run the shop, and a footer inviting
 * them to browse the menu or check "my orders" is noise in a workspace.
 */
export function SiteFooter({
  year,
  staff = false,
}: {
  year: number;
  /** Staff don't order, so the customer's links aren't theirs to follow. */
  staff?: boolean;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="grain relative overflow-hidden bg-ink-950 text-cream-100">
      <Marquee
        className="border-y border-white/10 py-3 text-sm font-bold uppercase tracking-widest text-gold-400"
        trackClassName="marquee-track--reverse"
        items={[
          "Made fresh daily",
          "Free coffee when you dine in",
          "Black pepper noodles",
          "Pickup & delivery",
          "Chicken wings coming soon",
        ]}
      />

      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-14 sm:grid-cols-3">
        <div>
          <Logo width={220} className="h-auto w-[180px]" />
          <p className="mt-4 text-sm text-cream-100/60">
            Home of Taiwan-Style Black Pepper Noodles.
          </p>

          {/* Marks rather than a list of handles: a stall's customers already
              know these three shapes, and they read at a glance in a way
              "Instagram @pepperpan.taiwanstylefood" never will. The name is
              still there for anyone who can't see the icon. */}
          <SocialLinks tone="dark" className="mt-5" />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gold-400">
            Explore
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link href="/menu" className="hover:text-gold-300">
                Menu
              </Link>
            </li>
            <li>
              <Link href="/news" className="hover:text-gold-300">
                News &amp; promos
              </Link>
            </li>
            <li>
              <Link href="/#story" className="hover:text-gold-300">
                Our story
              </Link>
            </li>
            <li>
              <Link href="/#visit" className="hover:text-gold-300">
                Visit us
              </Link>
            </li>
            {/* The owner has no orders — theirs land in their own kitchen
                queue — so the link would only ever lead to an empty page. */}
            {!staff && (
              <li>
                <Link href="/orders" className="hover:text-gold-300">
                  My orders
                </Link>
              </li>
            )}
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gold-400">
            Say hello
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <a href="tel:+639473533060" className="hover:text-gold-300">
                +63 947 353 3060
              </a>
            </li>
            <li className="text-cream-100/60">
              In front of Palengkeni, beside Osave! — Apalit, Pampanga,
              Philippines
            </li>
          </ul>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-white/10 py-5 text-xs text-cream-100/40 sm:flex-row sm:justify-center sm:gap-4">
        <span>© {year} Pepper Pan</span>
        <span aria-hidden className="hidden sm:inline">
          ·
        </span>
        <Link href="/terms" className="hover:text-gold-300">
          Terms &amp; conditions
        </Link>
      </div>
    </footer>
  );
}
