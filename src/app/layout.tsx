import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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
  keywords: [
    "Pepper Pan",
    "Taiwanese food Apalit",
    "black pepper noodles",
    "Ji Pai",
    "milktea Apalit",
    "food delivery Apalit Pampanga",
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
 * The intro is a first-impression, not a toll booth: it plays once per visit
 * and every load after that goes straight to the page. A hungry customer
 * coming back to check their order should not wait two seconds to see it,
 * and neither should anyone who reloads. A reduced-motion preference skips
 * it entirely. Client-side route changes never re-run this.
 */
const introScript = `(function(){try{
var d=document.documentElement;
var seen=false;
try{seen=sessionStorage.getItem('pp_intro')==='1';}catch(e){seen=false;}
if(seen||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  d.setAttribute('data-intro','skip');
}else{
  d.classList.add('intro-lock');
  try{sessionStorage.setItem('pp_intro','1');}catch(e){}
}
}catch(e){document.documentElement.setAttribute('data-intro','skip');}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // HQ brings its own sidebar shell. The shop's header, status banner, cart
  // button, chat widget and footer are for customers, and following the owner
  // into the back office they were only ever clutter — and, with a sidebar,
  // a second navigation competing with the first.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const inHQ = pathname.startsWith("/admin");

  const [viewer, chat, activeOrders] = await Promise.all([
    getViewer(),
    inHQ ? Promise.resolve({ messengerUrl: null }) : getChatSettings(),
    inHQ ? Promise.resolve(0) : countActiveOrders(),
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
        <CartProvider>
          {!inHQ && <Preloader />}
          <Cursor />
          <ScrollProgress />
          {!inHQ && (
            <>
            {/* Above the nav, not below it — and that ordering is load-bearing.
                Every page's masthead uses `.under-nav`, which pulls itself up by
                exactly the nav's height so the dark hero runs behind a
                transparent header. That only works while the masthead is the
                nav's next sibling. With the banner in between, the hero rose by
                the banner's height instead of the nav's: it stopped short of the
                top, leaving a strip of cream page showing with the logo and the
                account chip straddling the edge of it, and it covered the banner
                itself — so the one message that says "we're closed today" was
                painted over by the page it was warning about.

                Anything added here later belongs above this line, not between
                the banner and the page. */}
            <ShopStatusBanner />
            <Nav
              signedIn={!!viewer}
              staff={isStaff(viewer)}
              name={viewer?.profile?.full_name ?? null}
              activeOrders={activeOrders}
            />
            </>
          )}

          {children}
          {!inHQ && (
            <>
              <FloatingCart />
              <AskWidget messengerUrl={chat.messengerUrl} />
              <SiteFooter year={new Date().getFullYear()} />
            </>
          )}
        </CartProvider>
      </body>
    </html>
  );
}
