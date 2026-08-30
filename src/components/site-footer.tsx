"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Marquee } from "@/components/marquee";
import { Logo } from "@/components/logo";

/**
 * The shop's public footer.
 *
 * Hidden on /admin: the owner signs in to run the shop, and a footer inviting
 * them to browse the menu or check "my orders" is noise in a workspace.
 */
export function SiteFooter({ year }: { year: number }) {
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
              <Link href="/#story" className="hover:text-gold-300">
                Our story
              </Link>
            </li>
            <li>
              <Link href="/#visit" className="hover:text-gold-300">
                Visit us
              </Link>
            </li>
            <li>
              <Link href="/orders" className="hover:text-gold-300">
                My orders
              </Link>
            </li>
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
            <li>
              <a
                href="https://tiktok.com/@pepper.pan.taiwan"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gold-300"
              >
                TikTok @pepper.pan.taiwan
              </a>
            </li>
            <li className="text-cream-100/60">
              In front of Palengkeni, beside Osave! — Apalit
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 py-5 text-center text-xs text-cream-100/40">
        © {year} Pepper Pan
      </div>
    </footer>
  );
}
