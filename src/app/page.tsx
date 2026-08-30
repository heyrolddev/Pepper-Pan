import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FaqAccordion } from "@/components/faq-accordion";
import { Reveal } from "@/components/reveal";
import { Parallax } from "@/components/parallax";
import { Marquee } from "@/components/marquee";
import { CountUp } from "@/components/count-up";
import { HeroVisual } from "@/components/hero-visual";
import { WhyUs } from "@/components/why-us";
import { FanFavorites } from "@/components/fan-favorites";
import { CustomerAvatar } from "@/components/customer-avatar";
import { Stars } from "@/components/stars";
import {
  SectionMark,
  NoodleBowl,
  Chili,
  OrderBag,
  ChatSteam,
} from "@/components/spot-art";
import { getPublicReviews } from "@/lib/reviews-server";
import { isConfigured } from "@/lib/auth";
import { ShopSchema } from "@/components/shop-schema";

const ADDRESS =
  "In front of Palengkeni (New Apalit Public Market), beside Osave!, Apalit, Philippines";
const PHONE = "+63 947 353 3060";
const PHONE_HREF = "+639473533060";
const TIKTOK_HANDLE = "@pepper.pan.taiwan";
const TIKTOK_URL = "https://tiktok.com/@pepper.pan.taiwan";
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `Pepper Pan, ${ADDRESS}`
)}`;

const IMG_BASE =
  "https://djxcwbxahmtoglinsaaz.supabase.co/storage/v1/object/public/PepperPan";

const favorites = [
  { name: "Pork Noodles", image: `${IMG_BASE}/opt/FB.webp` },
  { name: "Chicken Noodles", image: `${IMG_BASE}/opt/FB%20(2).webp` },
  { name: "Pork Rice", image: `${IMG_BASE}/opt/9.webp` },
  { name: "Giant Ji Pai", image: `${IMG_BASE}/opt/21.webp` },
  { name: "Ji Pai Burger", image: `${IMG_BASE}/opt/7.webp` },
  { name: "Taiwan Milktea", image: `${IMG_BASE}/opt/26.webp` },
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
  // Real reviews when there are any; the original invitation copy otherwise,
  // so a new shop never shows an empty or invented testimonial.
  const { reviews, average, count: reviewCount } = isConfigured()
    ? await getPublicReviews(3)
    : { reviews: [], average: 0, count: 0 };
  const featured = reviews.filter((r) => r.comment && r.rating >= 4).slice(0, 3);

  const whyUsTiles = [
    {
      number: "01",
      label: "Bold Flavor",
      detail: "Real Taiwan-style black pepper sauce",
      tone: "red" as const,
    },
    {
      number: "02",
      label: "Made Fresh Daily",
      detail: "Nothing sits around, ever",
      tone: "gold" as const,
    },
    {
      number: "03",
      label: "Pickup & Delivery",
      detail: "Order ahead, skip the wait",
      tone: "jade" as const,
    },
    {
      number: "04",
      label: menuCount ? `${menuCount}+ Menu Items` : "Dozens of Items",
      detail: "Noodles, rice meals, milktea",
      tone: "cream" as const,
    },
  ];

  return (
    <main className="flex-1">
      {/* Hours, address, phone and rating for search engines — read from
          the shop's own data, so what Google shows is what the owner set. */}
      <ShopSchema />

      {/* ---------------------------------------------------------- */}
      {/* Hero                                                        */}
      {/* ---------------------------------------------------------- */}
      <section className="under-nav grain relative overflow-hidden bg-ink-950">
        <div aria-hidden className="hero-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/60 via-ink-950/85 to-ink-950"
        />
        <div
          aria-hidden
          className="drift pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-brand-600/40 blur-3xl"
        />
        <div
          aria-hidden
          className="drift pointer-events-none absolute -right-20 top-40 h-72 w-72 rounded-full bg-gold-400/20 blur-3xl"
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 sm:py-28 lg:grid-cols-[1.05fr_1fr]">
          <div className="flex flex-col items-start gap-6">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-gold-300">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
                Taiwan-Style Street Food
              </span>
            </Reveal>

            <Reveal delay={0.08}>
              <h1 className="font-display text-5xl font-black leading-[0.95] tracking-tight text-cream-50 sm:text-7xl">
                Home of
                <br />
                Taiwan-Style
                <br />
                <span className="relative inline-block text-gold-400">
                  Black Pepper
                  <svg
                    aria-hidden
                    viewBox="0 0 300 20"
                    className="absolute -bottom-1 left-0 w-full text-brand-500"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M2 12c30-14 60 14 90 0s60-14 90 0 60 14 90 0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>{" "}
                <span className="text-gold-400">Noodles</span>
              </h1>
            </Reveal>

            <Reveal delay={0.16}>
              <p className="max-w-md text-lg text-cream-100/70">
                New flavors, real cravings — you don&apos;t need to fly to
                Taiwan to taste it. Just come to Pepper Pan. 🔥
              </p>
            </Reveal>

            <Reveal delay={0.24}>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  href="/menu"
                  className="group relative overflow-hidden rounded-full bg-gold-400 px-7 py-3.5 font-bold text-ink-950 transition-transform hover:scale-105"
                >
                  <span className="relative z-10">View Menu →</span>
                </Link>
                <a
                  href="#story"
                  className="rounded-full border border-cream-100/25 px-7 py-3.5 font-semibold text-cream-50 transition-colors hover:border-gold-400 hover:text-gold-400"
                >
                  Our Story
                </a>
              </div>
            </Reveal>

            <Reveal delay={0.32}>
              <div className="flex items-center gap-2 pt-6 text-xs font-semibold uppercase tracking-widest text-cream-100/40">
                <span className="bob">↓</span> Scroll to explore
              </div>
            </Reveal>
          </div>

          <HeroVisual
            src={`${IMG_BASE}/opt/8.webp`}
            alt="Pepper Pan sizzling black pepper pork rice"
          />
        </div>
      </section>

      {/* Marquee ticker */}
      <Marquee
        className="border-y-4 border-ink-950 bg-brand-600 py-4 font-display text-xl font-black uppercase tracking-tight text-cream-50 sm:text-2xl"
        items={[
          "Black Pepper Noodles",
          "Made Fresh Daily",
          "Free Coffee Dine-In",
          "Giant Ji Pai",
          "Taiwan Milktea",
        ]}
        separator="🌶"
      />

      {/* ---------------------------------------------------------- */}
      {/* Why us                                                      */}
      {/* ---------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal className="mb-10 max-w-lg">
          <h2 className="font-display text-4xl font-black tracking-tight text-ink-950">
            Why everyone keeps coming back
          </h2>
        </Reveal>
        <WhyUs tiles={whyUsTiles} />
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Fan favorites                                               */}
      {/* ---------------------------------------------------------- */}
      <section className="grain relative overflow-hidden bg-ink-950 py-20">
        <div
          aria-hidden
          className="drift pointer-events-none absolute -right-20 top-20 h-72 w-72 rounded-full bg-chili-500/20 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-6">
          <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <SectionMark
                art={<NoodleBowl className="h-full w-full" />}
                className="text-gold-400"
              >
                Crowd pleasers
              </SectionMark>
              <h2 className="mt-2 font-display text-4xl font-black tracking-tight text-cream-50">
                Fan Favorites
              </h2>
            </div>
            <Link
              href="/menu"
              className="rounded-full border border-cream-100/25 px-5 py-2.5 text-sm font-semibold text-cream-50 transition-colors hover:border-gold-400 hover:text-gold-400"
            >
              See all {menuCount ?? ""} items →
            </Link>
          </Reveal>
          <FanFavorites items={favorites} />
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Promo                                                       */}
      {/* ---------------------------------------------------------- */}
      <section className="grain relative overflow-hidden bg-gold-400 py-16">
        <div className="relative mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 sm:flex-row sm:items-center">
          <Reveal direction="right">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-700">
              Dine-in special
            </span>
            <p className="mt-2 font-display text-3xl font-black leading-tight text-ink-950 sm:text-4xl">
              Free coffee when you dine in ☕
            </p>
            <p className="mt-2 font-semibold text-ink-800">
              Coming soon: Chicken Wings &amp; Chicken Pops 🔥
            </p>
          </Reveal>
          <Reveal direction="left" delay={0.1}>
            <Link
              href="/menu"
              className="inline-block whitespace-nowrap rounded-full bg-ink-950 px-8 py-4 font-bold text-gold-400 transition-transform hover:scale-105"
            >
              Order now →
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Story                                                       */}
      {/* ---------------------------------------------------------- */}
      <section id="story" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <Reveal direction="right">
            <SectionMark
              art={<Chili className="h-full w-full" />}
              className="text-brand-600"
            >
              Our story
            </SectionMark>
            <h2 className="mt-3 font-display text-4xl font-black leading-tight tracking-tight text-ink-950 sm:text-5xl">
              No passport required.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-800/80">
              We wanted people to experience bold, new flavors without booking
              a flight — so we brought Taiwan&apos;s street food culture
              straight to Apalit.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-ink-800/80">
              From our signature black pepper noodles to everything else on the
              menu, it&apos;s made fresh daily — the kind of food that stays on
              your mind long after the last bite.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-6 border-t border-ink-950/10 pt-6">
              <div>
                <p className="font-display text-3xl font-black text-brand-600">
                  <CountUp to={menuCount ?? 70} suffix="+" />
                </p>
                <p className="mt-1 text-sm text-ink-800/70">Menu items</p>
              </div>
              <div>
                <p className="font-display text-3xl font-black text-brand-600">
                  <CountUp to={100} suffix="%" />
                </p>
                <p className="mt-1 text-sm text-ink-800/70">Made in-house</p>
              </div>
              <div>
                <p className="font-display text-3xl font-black text-brand-600">1</p>
                <p className="mt-1 text-sm text-ink-800/70">Unforgettable bite</p>
              </div>
            </div>
          </Reveal>

          <Parallax distance={40}>
            <div className="grain relative aspect-square w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-gold-300 via-chili-400 to-brand-600">
              <Image
                src={`${IMG_BASE}/opt/5.webp`}
                alt="Pepper Pan black pepper noodles topped with a fried egg"
                fill
                sizes="(min-width: 1024px) 45vw, 90vw"
                className="object-contain p-8"
              />
            </div>
          </Parallax>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Testimonial                                                 */}
      {/* ---------------------------------------------------------- */}
      <section className="grain relative overflow-hidden bg-brand-600 py-20 text-cream-50">
        <div
          aria-hidden
          className="drift pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-gold-400/20 blur-3xl"
        />
        {featured.length > 0 ? (
          <Reveal className="relative mx-auto max-w-5xl px-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <Stars rating={average} size="lg" className="text-gold-300" />
              <p className="font-display text-2xl font-black">
                {average.toFixed(1)} out of 5
              </p>
              <p className="text-sm text-cream-100/70">
                from {reviewCount} customer review{reviewCount === 1 ? "" : "s"}
              </p>
            </div>

            <ul className="mt-10 grid gap-5 md:grid-cols-3">
              {featured.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-3xl bg-cream-50/10 p-6 ring-1 ring-cream-50/20"
                >
                  <Stars rating={r.rating} className="text-gold-300" />
                  <p className="flex-1 font-display text-lg font-bold leading-snug">
                    &ldquo;{r.comment}&rdquo;
                  </p>
                  <p className="text-sm text-cream-100/70">
                    {r.author}
                    {r.mealName && ` · ${r.mealName}`}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-8 text-center">
              <Link
                href="/reviews"
                className="inline-block rounded-full bg-gold-400 px-7 py-3 font-bold text-ink-950 transition-transform hover:scale-105"
              >
                Read all reviews →
              </Link>
            </div>
          </Reveal>
        ) : (
          <Reveal className="relative mx-auto flex max-w-4xl flex-col items-center gap-8 px-6 text-center sm:flex-row sm:text-left">
            <CustomerAvatar className="h-32 w-32 shrink-0 sm:h-40 sm:w-40" />
            <div>
              <span className="font-display text-6xl leading-none text-gold-300">
                &ldquo;
              </span>
              <p className="-mt-4 font-display text-2xl font-bold leading-snug sm:text-3xl">
                Once you taste it, you won&apos;t stop thinking about it.
              </p>
              <p className="mt-4 text-cream-100/80">
                We&apos;ve already got a lot of regulars who keep coming back for
                more — try it once, and you might just become one of them.
              </p>
            </div>
          </Reveal>
        )}
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Mission & vision                                            */}
      {/* ---------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-6 md:grid-cols-2">
          <Reveal direction="right">
            <div className="grain relative h-full overflow-hidden rounded-3xl bg-jade-700 p-10 text-cream-50">
              <span className="text-xs font-bold uppercase tracking-widest text-jade-200">
                Our mission
              </span>
              <p className="mt-4 font-display text-2xl font-bold leading-snug">
                Bring the bold flavors of Taiwan-style food to our community in
                Apalit — made fresh every single day.
              </p>
            </div>
          </Reveal>
          <Reveal direction="left" delay={0.1}>
            <div className="grain relative h-full overflow-hidden rounded-3xl bg-ink-950 p-10 text-cream-50">
              <span className="text-xs font-bold uppercase tracking-widest text-gold-400">
                Our vision
              </span>
              <p className="mt-4 font-display text-2xl font-bold leading-snug">
                To be the neighborhood&apos;s go-to spot for Taiwan-style
                cravings — no flight required.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Visit                                                       */}
      {/* ---------------------------------------------------------- */}
      <section id="visit" className="scroll-mt-24 bg-cream-100 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <SectionMark
              art={<OrderBag className="h-full w-full" />}
              className="text-brand-600"
            >
              Come see us
            </SectionMark>
            <h2 className="mt-3 font-display text-4xl font-black tracking-tight text-ink-950 sm:text-5xl">
              Visit Pepper Pan
            </h2>
            <p className="mt-5 max-w-xl text-lg text-ink-800/80">{ADDRESS}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-brand-600 px-6 py-3 font-bold text-cream-50 transition-transform hover:scale-105"
              >
                Get Directions →
              </a>
              <a
                href={`tel:${PHONE_HREF}`}
                className="rounded-full border-2 border-ink-950 px-6 py-3 font-semibold text-ink-950 transition-colors hover:bg-ink-950 hover:text-cream-50"
              >
                {PHONE}
              </a>
              <a
                href={TIKTOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border-2 border-ink-950 px-6 py-3 font-semibold text-ink-950 transition-colors hover:bg-ink-950 hover:text-cream-50"
              >
                TikTok {TIKTOK_HANDLE}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* FAQ                                                         */}
      {/* ---------------------------------------------------------- */}
      <section className="mx-auto max-w-3xl px-6 py-24">
        <Reveal className="mb-8">
          <SectionMark
            art={<ChatSteam className="h-full w-full" />}
            className="text-brand-600"
          >
            Good to know
          </SectionMark>
          <h2 className="mt-3 font-display text-4xl font-black tracking-tight text-ink-950">
            Frequently asked questions
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <FaqAccordion items={faqs} />
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Final CTA                                                   */}
      {/* ---------------------------------------------------------- */}
      <section className="grain relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-chili-500 py-24 text-center">
        <Reveal className="relative mx-auto max-w-2xl px-6">
          <h2 className="font-display text-5xl font-black tracking-tight text-cream-50 sm:text-6xl">
            Hungry yet?
          </h2>
          <p className="mt-4 text-lg text-cream-100/80">
            Order ahead and skip the wait. Your next craving starts here.
          </p>
          <Link
            href="/menu"
            className="mt-8 inline-block rounded-full bg-gold-400 px-10 py-5 font-display text-lg font-black text-ink-950 transition-transform hover:scale-105"
          >
            View Full Menu →
          </Link>
        </Reveal>
      </section>
    </main>
  );
}
