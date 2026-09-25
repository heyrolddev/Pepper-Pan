import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import { Nav } from "@/components/nav";
import { FloatingCart } from "@/components/floating-cart";
import { DesktopCursor } from "@/components/desktop-cursor";
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
  /**
   * NO CANONICAL HERE. It used to say `{ canonical: "/" }`, and that was the
   * most expensive line in this file.
   *
   * Metadata in a Next layout is INHERITED by every page under it that does
   * not override the same key. Only /menu set its own — so /reviews, /terms,
   * /news and every single promo post shipped
   * `<link rel="canonical" href="https://…/">`, which tells a search engine
   * "this page is a duplicate of the homepage, index that instead". The shop
   * was asking Google to drop its own reviews page and every promo from the
   * index, while `sitemap.ts` was busy submitting them all for crawling. Two
   * files, directly contradicting each other, with nothing on any screen to
   * say so.
   *
   * Each public page names its own now — see `canonical()` in src/lib/site.ts
   * — and the homepage's lives on the homepage.
   */
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
 * It decides whether this load gets the intro: the first load of a visit does,
 * and nothing after it. Not inside HQ, and not for anyone who has asked their
 * device for less motion. Client-side route changes never re-run this, so
 * moving between pages without a reload stays instant either way.
 *
 * ONCE A VISIT, NOT ONCE A PAGE
 *
 * It used to play on every load, and that was 1.8 seconds — 1.1s on screen
 * plus a 0.7s slide-off — of deliberately frozen page, repeated every time
 * somebody opened a shared link, hit back, or reloaded because the page felt
 * slow. On a phone that reads as the site being slow, because for those 1.8
 * seconds it genuinely is: the scroll lock below means nothing else can
 * happen. The animation was being blamed for the wait it was causing.
 *
 * A flag in sessionStorage is the right scope for it. It survives navigation
 * and reloads within the visit, and it is gone by the next one — so the intro
 * still greets everyone who arrives, and never again while they shop. It is
 * also per-tab, which is what a "visit" means to a person.
 *
 * And it locks scrolling behind the overlay — which is why the path check
 * matters more than it looks. Only the Preloader component removes that lock,
 * and the Preloader isn't rendered in HQ. Locking a page whose overlay will
 * never appear would freeze it for good. The timeout below is the second
 * belt: whatever happens, nothing stays frozen.
 */
const introScript = `(function(){try{
var d=document.documentElement;

// The saved screen-layout choice, applied before the first paint so a tablet
// set to landscape never flashes the tall portrait masthead on its way to the
// short one. Reading it costs nothing; re-laying out the page after paint
// would cost a visible jump. See src/lib/screen.ts.
try{var s=localStorage.getItem('pp-screen');if(s==='wide')d.setAttribute('data-screen','wide');}catch(e){}

var hq=location.pathname.indexOf('/admin')===0;
var seen=false;
// Private mode can refuse sessionStorage outright. A visitor who cannot be
// remembered is treated as already greeted: showing the intro on every single
// load is the worse of the two failures.
try{seen=sessionStorage.getItem('pp-intro')==='1';}catch(e){seen=true;}

// A reload is a deliberate re-fetch, and the one load where the bundle and
// the hero video are NOT in cache — so it is the load with the most to cover
// and the one the splash was missed on. navigation.type tells the two
// apart: moving between pages in the same session stays quiet, pressing
// refresh gets the pan again.
var again=false;
try{var nav=performance.getEntriesByType('navigation')[0];again=!!nav&&nav.type==='reload';}catch(e){}
if(hq||(seen&&!again)||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  d.setAttribute('data-intro','skip');
}else{
  try{sessionStorage.setItem('pp-intro','1');}catch(e){}
  d.classList.add('intro-lock');
  // The overlay is pure CSS now and always leaves at 1.8s, so this releases
  // the scroll with it rather than guarding a React effect that might never
  // run. It is still the only thing that unlocks the page — a page that
  // cannot be scrolled is broken, so this must not depend on the bundle.
  setTimeout(function(){d.classList.remove('intro-lock');},1800);
  // Belt, for the browser that somehow never runs the animation: after that
  // the splash is hidden outright rather than left covering the shop.
  setTimeout(function(){d.setAttribute('data-intro','skip');},2600);
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
          <DesktopCursor />
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
