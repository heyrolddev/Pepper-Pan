import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import { Nav } from "@/components/nav";
import { FloatingCart } from "@/components/floating-cart";
import { Cursor } from "@/components/cursor";
import { ScrollProgress } from "@/components/scroll-progress";
import { Preloader } from "@/components/preloader";
import { SiteFooter } from "@/components/site-footer";
import { ShopStatusBanner } from "@/components/shop-status-banner";
import { countActiveOrders, getViewer, isStaff } from "@/lib/auth";
import { AskWidget } from "@/components/ask-widget";
import { getChatSettings } from "@/lib/chat-settings";
import { SHOP, siteUrl } from "@/lib/site";
import { ShopChrome } from "@/components/shop-chrome";

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
  // Absolute URLs are mandatory for share cards: Facebook and Messenger
  // silently ignore a relative image, which is the failure that reads as
  // "the picture doesn't show up when I paste the link".
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SHOP.name} — ${SHOP.tagline}`,
    // Inner pages get "Menu · Pepper Pan" without each one repeating it.
    template: `%s · ${SHOP.name}`,
  },
  description: SHOP.description,
  // Every public page resolves to one address. Without this a search engine
  // treats the Vercel preview URL, the bare domain and the www one as three
  // different sites competing with each other, and splits the ranking of each
  // page between them.
  alternates: { canonical: "/" },
  // Search engines have not used this tag for ranking in over a decade. It is
  // kept because some Philippine directory and aggregator sites still read it
  // when they scrape a listing — that is its whole remaining job, so the
  // terms here are the ones a person would actually type, local and specific.
  // "pepper" and "food" alone are not searches anyone makes with the intent
  // to eat at a stall in Apalit; they are words that appear in a hundred
  // million pages, and listing them wins nothing.
  keywords: [
    "Pepper Pan",
    "Pepper Pan Apalit",
    "Taiwanese food Apalit",
    "Taiwan street food Pampanga",
    "black pepper noodles",
    "black pepper noodles Apalit",
    "peppery noodles Pampanga",
    "Ji Pai",
    "Ji Pai chicken Apalit",
    "milktea Apalit",
    "food delivery Apalit Pampanga",
    "pagkain sa Apalit",
    "masarap na pagkain Apalit",
    "New Apalit Public Market food",
  ],
  openGraph: {
    type: "website",
    siteName: SHOP.name,
    title: `${SHOP.name} — ${SHOP.tagline}`,
    description: SHOP.description,
    locale: "en_PH",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SHOP.name} — ${SHOP.tagline}`,
    description: SHOP.description,
  },
  // The manifest is what lets a phone keep this on its home screen — and on
  // iOS that is not cosmetic: Safari only allows notifications for a site
  // that has been added to the home screen, so without this the owner's
  // iPhone could never be reached at all.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Pepper Pan",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1310",
};

/**
 * Runs before first paint so the real page never flashes before the overlay.
 *
 * Two jobs, and the second one is load-bearing.
 *
 * It decides whether this load gets the intro: every page load does, except
 * inside HQ and except for anyone who has asked their device for less motion.
 * Client-side route changes never re-run this, so moving between pages
 * without a reload stays instant either way.
 *
 * And it locks scrolling behind the overlay — which is why the path check
 * matters more than it looks. Only the Preloader component removes that lock,
 * and the Preloader isn't rendered in HQ. Locking a page whose overlay will
 * never appear would freeze it for good. The timeout below is the second
 * belt: whatever happens, nothing stays frozen.
 */
const introScript = `(function(){try{
var d=document.documentElement;
var hq=location.pathname.indexOf('/admin')===0;
if(hq||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  d.setAttribute('data-intro','skip');
}else{
  d.classList.add('intro-lock');
  // A page that cannot be scrolled is broken, so the lock releases itself
  // even if the overlay never mounts.
  setTimeout(function(){d.classList.remove('intro-lock');},4000);
}
}catch(e){document.documentElement.setAttribute('data-intro','skip');}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [viewer, chat, activeOrders] = await Promise.all([
    getViewer(),
    getChatSettings(),
    countActiveOrders(),
  ]);

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
        <CartProvider staff={isStaff(viewer)}>
          {/* Mounted everywhere on purpose. It skips itself inside HQ via the
              data-intro attribute the head script sets; unmounting it while
              the intro is still running would strand the scroll lock. */}
          <Preloader />
          <Cursor />
          <ScrollProgress />

          <ShopChrome>
            {/* Above the nav, not below it — and that ordering is
                load-bearing. Every page's masthead uses `.under-nav`, which
                pulls itself up by exactly the nav's height so the dark hero
                runs behind a transparent header. That only works while the
                masthead is the nav's next sibling. With the banner in
                between, the hero rose by the banner's height instead: it
                stopped short of the top, leaving a strip of cream page
                showing with the logo straddling the edge of it, and it
                covered the banner itself — so the one message that says
                "we're closed today" was painted over by the page it was
                warning about.

                Anything added here later belongs above this line, not between
                the banner and the page. */}
            <ShopStatusBanner />
            <Nav
              signedIn={!!viewer}
              staff={isStaff(viewer)}
              role={viewer?.profile?.role ?? null}
              name={viewer?.profile?.full_name ?? null}
              activeOrders={activeOrders}
            />
          </ShopChrome>

          {children}

          <ShopChrome>
            <FloatingCart staff={isStaff(viewer)} />
            <AskWidget messengerUrl={chat.messengerUrl} />
            <SiteFooter year={new Date().getFullYear()} staff={isStaff(viewer)} />
          </ShopChrome>
        </CartProvider>
      </body>
    </html>
  );
}
