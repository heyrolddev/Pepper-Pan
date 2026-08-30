import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import { Nav } from "@/components/nav";
import { FloatingCart } from "@/components/floating-cart";
import { Cursor } from "@/components/cursor";
import { ScrollProgress } from "@/components/scroll-progress";
import { Preloader } from "@/components/preloader";
import { SiteFooter } from "@/components/site-footer";
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

          <SiteFooter year={new Date().getFullYear()} />
        </CartProvider>
      </body>
    </html>
  );
}
