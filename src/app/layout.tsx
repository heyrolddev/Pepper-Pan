import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import { Nav } from "@/components/nav";
import { FloatingCart } from "@/components/floating-cart";
import { Cursor } from "@/components/cursor";
import { ScrollProgress } from "@/components/scroll-progress";
import { Marquee } from "@/components/marquee";
import { Preloader } from "@/components/preloader";
import { Logo } from "@/components/logo";
import { getViewer, isStaff } from "@/lib/auth";
import { AskWidget } from "@/components/ask-widget";
import { getChatSettings } from "@/lib/chat-settings";

// Warm display serif — reads artisanal and appetising rather than corporate.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

// Friendly geometric sans for body copy and UI.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pepper Pan — Home of Taiwan-Style Black Pepper Noodles",
  description:
    "Taiwan-style black pepper noodles, rice meals and milktea, made fresh daily in Apalit. Order ahead for pickup or delivery.",
};

/**
 * Runs before first paint so the real page never flashes before the
 * overlay. The intro plays on every page load; only a reduced-motion
 * preference skips it. Client-side route changes don't re-run this, so
 * navigating between pages stays instant.
 */
const introScript = `(function(){try{
var d=document.documentElement;
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){d.setAttribute('data-intro','skip');}
else{d.classList.add('intro-lock');}
}catch(e){document.documentElement.setAttribute('data-intro','skip');}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [viewer, chat] = await Promise.all([getViewer(), getChatSettings()]);

  return (
    <html
      lang="en"
      // The intro script below sets a class/attribute on <html> before
      // hydration, which React would otherwise flag as a mismatch.
      suppressHydrationWarning
      className={`${fraunces.variable} ${jakarta.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: introScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-cream-50 font-sans text-ink-900">
        <CartProvider>
          <Preloader />
          <Cursor />
          <ScrollProgress />
          <Nav
            signedIn={!!viewer}
            staff={isStaff(viewer)}
            name={viewer?.profile?.full_name ?? null}
          />
          {children}
          <FloatingCart />
          <AskWidget messengerUrl={chat.messengerUrl} />

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
              © {new Date().getFullYear()} Pepper Pan
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
