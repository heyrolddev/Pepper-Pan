import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import { Nav } from "@/components/nav";
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
  description: "Fresh bakes, made daily — order ahead for pickup or delivery.",
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
      <body className="min-h-full flex flex-col bg-amber-50 dark:bg-neutral-950">
        <CartProvider>
          <Nav userEmail={userEmail} />
          {children}
          <footer className="border-t border-amber-200/60 py-8 text-center text-sm text-amber-700/70 dark:border-neutral-800 dark:text-amber-200/50">
            © {new Date().getFullYear()} Pepper Pan
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
