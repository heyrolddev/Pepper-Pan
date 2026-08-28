import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FaqAccordion } from "@/components/faq-accordion";

const ADDRESS = "In front of Palengkeni (New Apalit Public Market), beside Osave!, Apalit, Philippines";
const PHONE = "+63 947 353 3060";
const PHONE_HREF = "+639473533060";
const TIKTOK_HANDLE = "@pepper.pan.taiwan";
const TIKTOK_URL = "https://tiktok.com/@pepper.pan.taiwan";
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Pepper Pan, ${ADDRESS}`)}`;

const IMG_BASE = "https://djxcwbxahmtoglinsaaz.supabase.co/storage/v1/object/public/PepperPan";

const favorites = [
  { name: "Pork Noodles", price: "₱179", image: `${IMG_BASE}/FB.jpg` },
  { name: "Chicken Noodles", price: "₱179", image: `${IMG_BASE}/FB%20(2).jpg` },
  { name: "Pork Rice", price: "₱135", image: `${IMG_BASE}/9.jpg` },
  { name: "Giant Ji Pai", price: "₱155", image: `${IMG_BASE}/21.jpg` },
  { name: "Ji Pai Burger", price: "₱85 – ₱99", image: `${IMG_BASE}/7.jpg` },
  { name: "Taiwan Milktea", price: "₱99", image: `${IMG_BASE}/26.jpg` },
];

async function getMenuCount(): Promise<number | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("meals")
      .select("id", { count: "exact", head: true })
      .eq("is_public", true)
      .eq("is_available", true);
    if (error) throw error;
    return count ?? null;
  } catch (err) {
    console.error("Failed to load menu count:", err);
    return null;
  }
}

const faqs = [
  {
    question: "How do I place an order?",
    answer:
      "Browse the menu, add items to your cart, sign in with your email (we send a one-time link — no password needed), then check out.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "Cash on pickup or delivery for now — online payment is coming soon.",
  },
  {
    question: "Do you offer delivery?",
    answer:
      "Yes — choose delivery at checkout and leave your address in the notes. Ask us about delivery areas and fees.",
  },
  {
    question: "Can I customize my order?",
    answer: "Leave a note at checkout and we'll do our best to accommodate.",
  },
  {
    question: "Do I need to create an account?",
    answer:
      "Just an email address — we'll send you a one-time sign-in link, no password to remember.",
  },
];

export default async function Home() {
  const menuCount = await getMenuCount();

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-brand-100 to-brand-50 dark:from-brand-900 dark:to-brand-950"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-brand-300/50 blur-3xl dark:bg-brand-700/30"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 top-20 -z-10 h-56 w-56 rounded-full bg-brand-400/40 blur-3xl dark:bg-brand-600/30"
        />

        <div className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-20 sm:py-28 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-6">
            <span className="rounded-full bg-brand-900/10 px-4 py-1 text-sm font-medium text-brand-800 dark:bg-brand-50/10 dark:text-brand-200">
              Taiwan-Style Food
            </span>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-brand-950 dark:text-brand-50 sm:text-6xl">
              Home of Taiwan-Style Black Pepper Noodles
            </h1>
            <p className="max-w-xl text-lg text-brand-800/80 dark:text-brand-100/70">
              New flavors, real cravings — you don&apos;t need to fly to Taiwan
              to taste it. Just come to Pepper Pan. 🔥
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Link
                href="/menu"
                className="rounded-full bg-brand-900 px-6 py-3 font-medium text-brand-50 transition-colors hover:bg-brand-800 dark:bg-brand-100 dark:text-brand-950 dark:hover:bg-brand-200"
              >
                View Menu
              </Link>
              <a
                href="#story"
                className="rounded-full border border-brand-300 px-6 py-3 font-medium text-brand-900 transition-colors hover:bg-brand-900/5 dark:border-brand-700 dark:text-brand-100 dark:hover:bg-brand-50/5"
              >
                Our Story
              </a>
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-sm lg:max-w-none">
            <Image
              src={`${IMG_BASE}/8.png`}
              alt="Pepper Pan sizzling pork rice"
              fill
              sizes="(min-width: 1024px) 40vw, 80vw"
              className="object-contain drop-shadow-2xl"
              priority
            />
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="border-y border-brand-200/60 bg-white/40 dark:border-brand-800 dark:bg-brand-900/40">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-10 sm:grid-cols-3">
          {[
            {
              label: menuCount ? `${menuCount}+ menu items` : "Dozens of menu items",
              detail: "Noodles, rice meals, and more",
            },
            { label: "Loved by repeat customers", detail: "Once you try it, you'll be back" },
            { label: "Pickup & delivery", detail: "Order ahead, skip the wait" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-1">
              <span className="text-lg font-semibold text-brand-950 dark:text-brand-50">
                {item.label}
              </span>
              <span className="text-sm text-brand-800/70 dark:text-brand-100/60">
                {item.detail}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Promo banner */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-brand-900 px-8 py-10 text-brand-50 dark:bg-brand-100 dark:text-brand-950 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide opacity-80">
              Dine-in special
            </p>
            <p className="mt-1 text-2xl font-semibold">Get a FREE coffee when you dine in 🎉</p>
            <p className="mt-1 text-sm opacity-80">
              Coming soon: Chicken Wings & Chicken Pops 🔥
            </p>
          </div>
          <Link
            href="/menu"
            className="whitespace-nowrap rounded-full bg-brand-50 px-6 py-3 font-medium text-brand-950 transition-colors hover:bg-brand-200 dark:bg-brand-950 dark:text-brand-50 dark:hover:bg-brand-800"
          >
            Order now
          </Link>
        </div>
      </section>

      {/* Fan favorites */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
          Fan Favorites
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {favorites.map((item) => (
            <Link
              key={item.name}
              href="/menu"
              className="group overflow-hidden rounded-xl border border-brand-200/60 bg-white/60 shadow-sm transition-shadow hover:shadow-md dark:border-brand-800 dark:bg-brand-900/60"
            >
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  sizes="(min-width: 640px) 33vw, 50vw"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Story */}
      <section id="story" className="mx-auto max-w-5xl scroll-mt-16 px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 sm:items-center">
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
              Our story
            </h2>
            <p className="text-brand-800/80 dark:text-brand-100/70">
              Taiwan-style food, done right — no passport required. We wanted
              people to experience bold, new flavors without booking a
              flight, so we brought Taiwan&apos;s street food culture straight
              to Apalit.
            </p>
            <p className="text-brand-800/80 dark:text-brand-100/70">
              From our signature Black Pepper Noodles to everything else on
              the menu, it&apos;s made fresh daily — the kind of food that
              stays on your mind long after the last bite. Ask any of our
              regulars.
            </p>
          </div>
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-300 to-brand-600 dark:from-brand-800 dark:to-brand-600">
            <Image
              src={`${IMG_BASE}/5.png`}
              alt="Pepper Pan black pepper noodles with egg"
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-contain p-6"
            />
          </div>
        </div>
      </section>

      {/* Mission & vision */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-brand-200/60 bg-white/60 p-8 dark:border-brand-800 dark:bg-brand-900/60">
            <h3 className="text-xl font-semibold text-brand-950 dark:text-brand-50">
              Our mission
            </h3>
            <p className="mt-3 text-brand-800/80 dark:text-brand-100/70">
              To bring the bold flavors of Taiwan-style food to our community
              in Apalit, made fresh every single day.
            </p>
          </div>
          <div className="rounded-2xl border border-brand-200/60 bg-white/60 p-8 dark:border-brand-800 dark:bg-brand-900/60">
            <h3 className="text-xl font-semibold text-brand-950 dark:text-brand-50">
              Our vision
            </h3>
            <p className="mt-3 text-brand-800/80 dark:text-brand-100/70">
              To be the neighborhood&apos;s go-to spot for Taiwan-style
              cravings — no flight required.
            </p>
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-2xl border border-brand-200/60 bg-white/60 p-8 dark:border-brand-800 dark:bg-brand-900/60">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
            Visit us
          </h2>
          <p className="mt-3 text-brand-800/80 dark:text-brand-100/70">{ADDRESS}</p>
          <div className="mt-5 flex flex-wrap gap-4">
            <a
              href={MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-brand-900 px-5 py-2.5 text-sm font-medium text-brand-50 transition-colors hover:bg-brand-800 dark:bg-brand-100 dark:text-brand-950 dark:hover:bg-brand-200"
            >
              Get Directions
            </a>
            <a
              href={`tel:${PHONE_HREF}`}
              className="rounded-full border border-brand-300 px-5 py-2.5 text-sm font-medium text-brand-900 transition-colors hover:bg-brand-900/5 dark:border-brand-700 dark:text-brand-100 dark:hover:bg-brand-50/5"
            >
              {PHONE}
            </a>
            <a
              href={TIKTOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-brand-300 px-5 py-2.5 text-sm font-medium text-brand-900 transition-colors hover:bg-brand-900/5 dark:border-brand-700 dark:text-brand-100 dark:hover:bg-brand-50/5"
            >
              TikTok {TIKTOK_HANDLE}
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
          Frequently asked questions
        </h2>
        <FaqAccordion items={faqs} />
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-5xl px-6 pb-24 pt-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
          Hungry yet?
        </h2>
        <Link
          href="/menu"
          className="mt-6 inline-block rounded-full bg-brand-900 px-8 py-4 font-medium text-brand-50 transition-colors hover:bg-brand-800 dark:bg-brand-100 dark:text-brand-950 dark:hover:bg-brand-200"
        >
          View Full Menu
        </Link>
      </section>
    </main>
  );
}
