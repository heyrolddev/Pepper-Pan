import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FaqAccordion } from "@/components/faq-accordion";
import { Reveal } from "@/components/reveal";
import { HeroVisual } from "@/components/hero-visual";
import { WhyUs } from "@/components/why-us";
import { FanFavorites } from "@/components/fan-favorites";
import { CustomerAvatar } from "@/components/customer-avatar";

const ADDRESS = "In front of Palengkeni (New Apalit Public Market), beside Osave!, Apalit, Philippines";
const PHONE = "+63 947 353 3060";
const PHONE_HREF = "+639473533060";
const TIKTOK_HANDLE = "@pepper.pan.taiwan";
const TIKTOK_URL = "https://tiktok.com/@pepper.pan.taiwan";
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Pepper Pan, ${ADDRESS}`)}`;

const IMG_BASE = "https://djxcwbxahmtoglinsaaz.supabase.co/storage/v1/object/public/PepperPan";

const favorites = [
  { name: "Pork Noodles", image: `${IMG_BASE}/FB.jpg` },
  { name: "Chicken Noodles", image: `${IMG_BASE}/FB%20(2).jpg` },
  { name: "Pork Rice", image: `${IMG_BASE}/9.jpg` },
  { name: "Giant Ji Pai", image: `${IMG_BASE}/21.jpg` },
  { name: "Ji Pai Burger", image: `${IMG_BASE}/7.jpg` },
  { name: "Taiwan Milktea", image: `${IMG_BASE}/26.jpg` },
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

  const whyUsTiles = [
    {
      number: "1",
      label: "Bold Flavor",
      detail: "Real Taiwan-style black pepper sauce",
      tone: "red" as const,
    },
    {
      number: "2",
      label: "Made Fresh Daily",
      detail: "Nothing sits around",
      tone: "gold" as const,
    },
    {
      number: "3",
      label: "Pickup & Delivery",
      detail: "Order ahead, skip the wait",
      tone: "charcoal" as const,
    },
    {
      number: "4",
      label: menuCount ? `${menuCount}+ Menu Items` : "Dozens of Items",
      detail: "Noodles, rice meals, and more",
      tone: "cream" as const,
    },
  ];

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-950">
        <div
          aria-hidden
          className="hero-grid pointer-events-none absolute inset-0 -z-10 origin-top"
          style={{ transform: "perspective(500px) rotateX(60deg) scale(2)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-brand-950/40 via-brand-950/80 to-brand-950"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 top-10 -z-10 h-72 w-72 rounded-full bg-gold-400/20 blur-3xl"
        />

        <div className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-20 sm:py-28 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-6">
            <span className="rounded-full bg-gold-400 px-4 py-1 text-sm font-semibold text-brand-950">
              Taiwan-Style Food ✨
            </span>
            <h1 className="max-w-xl text-4xl font-black tracking-tight text-white sm:text-6xl">
              Home of Taiwan-Style{" "}
              <span className="relative inline-block">
                Black Pepper Noodles
                <svg
                  aria-hidden
                  viewBox="0 0 300 20"
                  className="absolute -bottom-2 left-0 w-full text-gold-400"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 12c30-14 60 14 90 0s60-14 90 0 60 14 90 0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="max-w-xl text-lg text-white/80">
              New flavors, real cravings — you don&apos;t need to fly to Taiwan
              to taste it. Just come to Pepper Pan. 🔥
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Link
                href="/menu"
                className="rounded-full bg-gold-400 px-6 py-3 font-semibold text-brand-950 transition-colors hover:bg-gold-300"
              >
                View Menu
              </Link>
              <a
                href="#story"
                className="rounded-full border border-white/30 px-6 py-3 font-medium text-white transition-colors hover:bg-white/10"
              >
                Our Story
              </a>
            </div>
          </div>
          <HeroVisual src={`${IMG_BASE}/8.png`} alt="Pepper Pan sizzling pork rice" />
        </div>
      </section>

      {/* Why us */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <Reveal>
          <WhyUs tiles={whyUsTiles} />
        </Reveal>
      </section>

      {/* Promo banner */}
      <section className="bg-gold-400 py-14">
        <Reveal className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 px-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-800">
              Dine-in special
            </p>
            <p className="mt-1 text-2xl font-bold text-brand-950">
              Get a FREE coffee when you dine in 🎉
            </p>
            <p className="mt-1 text-sm text-brand-800">
              Coming soon: Chicken Wings & Chicken Pops 🔥
            </p>
          </div>
          <Link
            href="/menu"
            className="whitespace-nowrap rounded-full bg-brand-950 px-6 py-3 font-semibold text-gold-400 transition-colors hover:bg-brand-900"
          >
            Order now
          </Link>
        </Reveal>
      </section>

      {/* Fan favorites */}
      <section className="bg-brand-950 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <h2 className="mb-6 text-2xl font-bold tracking-tight text-white">
              Fan Favorites
            </h2>
          </Reveal>
          <FanFavorites items={favorites} />
        </div>
      </section>

      {/* Story */}
      <section id="story" className="mx-auto max-w-5xl scroll-mt-16 px-6 py-16">
        <Reveal className="grid gap-10 sm:grid-cols-2 sm:items-center">
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-brand-50">
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
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-gold-300 to-brand-600">
            <Image
              src={`${IMG_BASE}/5.png`}
              alt="Pepper Pan black pepper noodles with egg"
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-contain p-6"
            />
          </div>
        </Reveal>
      </section>

      {/* Testimonial */}
      <section className="bg-brand-600 py-16 text-white">
        <Reveal className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 text-center sm:flex-row sm:text-left">
          <CustomerAvatar className="h-32 w-32 shrink-0 sm:h-40 sm:w-40" />
          <div>
            <svg viewBox="0 0 24 24" aria-hidden className="mx-auto h-8 w-8 text-gold-300 sm:mx-0">
              <path
                fill="currentColor"
                d="M7.17 6A5.17 5.17 0 0 0 2 11.17V18h6.83v-6.83H4.5a2.67 2.67 0 0 1 2.67-2.67V6Zm10 0A5.17 5.17 0 0 0 12 11.17V18h6.83v-6.83H14.5a2.67 2.67 0 0 1 2.67-2.67V6Z"
              />
            </svg>
            <p className="mt-3 text-xl font-medium">
              Once you taste it, you won&apos;t stop thinking about it.
            </p>
            <p className="mt-2 text-white/80">
              We&apos;ve already got a lot of regulars who keep coming back
              for more — try it once, and you might just become one of them.
            </p>
          </div>
        </Reveal>
      </section>

      {/* Mission & vision */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <Reveal className="grid gap-6 sm:grid-cols-2">
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
        </Reveal>
      </section>

      {/* Location */}
      <section className="bg-brand-950 py-16 text-white">
        <Reveal className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold tracking-tight">Visit us</h2>
          <p className="mt-3 text-white/80">{ADDRESS}</p>
          <div className="mt-5 flex flex-wrap gap-4">
            <a
              href={MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-gold-400 px-5 py-2.5 text-sm font-semibold text-brand-950 transition-colors hover:bg-gold-300"
            >
              Get Directions
            </a>
            <a
              href={`tel:${PHONE_HREF}`}
              className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              {PHONE}
            </a>
            <a
              href={TIKTOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              TikTok {TIKTOK_HANDLE}
            </a>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <Reveal>
          <h2 className="mb-6 text-2xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
            Frequently asked questions
          </h2>
          <FaqAccordion items={faqs} />
        </Reveal>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-r from-brand-600 to-gold-400 py-20 text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-white">Hungry yet?</h2>
          <Link
            href="/menu"
            className="mt-6 inline-block rounded-full bg-brand-950 px-8 py-4 font-semibold text-gold-400 transition-colors hover:bg-brand-900"
          >
            View Full Menu →
          </Link>
        </Reveal>
      </section>
    </main>
  );
}
