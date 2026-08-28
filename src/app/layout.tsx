import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import { Nav } from "@/components/nav";
import { Cursor } from "@/components/cursor";
import { createClient } from "@/lib/supabase/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pepper Pan",
  description:
    "Home of Taiwan-Style Black Pepper Noodles — order ahead for pickup or delivery.",
};

async function getUserEmail(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const userEmail = await getUserEmail();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-brand-50 font-sans dark:bg-brand-950">
        <CartProvider>
          <Cursor />
          <Nav userEmail={userEmail} />
          {children}
          <footer className="border-t border-brand-200/60 py-8 text-center text-sm text-brand-700/70 dark:border-brand-800 dark:text-brand-200/50">
            <p>© {new Date().getFullYear()} Pepper Pan</p>
            <p className="mt-1">
              <a href="tel:+639473533060" className="hover:underline">
                +63 947 353 3060
              </a>
              {" · "}
              <a
                href="https://tiktok.com/@pepper.pan.taiwan"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                TikTok @pepper.pan.taiwan
              </a>
            </p>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
