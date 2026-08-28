import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FaqAccordion } from "@/components/faq-accordion";

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
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/3 -z-10 h-40 w-40 rounded-full bg-brand-500/20 blur-3xl dark:bg-brand-500/20"
        />

        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-6 py-24 sm:py-32">
          <span className="rounded-full bg-brand-900/10 px-4 py-1 text-sm font-medium text-brand-800 dark:bg-brand-50/10 dark:text-brand-200">
            Taiwanese Street Food & Milktea
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-brand-950 dark:text-brand-50 sm:text-6xl">
            Real Taiwanese flavor, made fresh every day.
          </h1>
          <p className="max-w-xl text-lg text-brand-800/80 dark:text-brand-100/70">
            From crispy Ji Pai to hand-shaken milktea — order ahead for
            pickup or delivery, or come see us in person.
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
      </section>

      {/* Highlights */}
      <section className="border-y border-brand-200/60 bg-white/40 dark:border-brand-800 dark:bg-brand-900/40">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-10 sm:grid-cols-3">
          {[
            {
              label: menuCount ? `${menuCount}+ menu items` : "Dozens of menu items",
              detail: "Mains, snacks, and milktea",
            },
            { label: "Made fresh daily", detail: "Nothing sits around" },
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
              This week
            </p>
            <p className="mt-1 text-2xl font-semibold">
              Try our signature milktea combo
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

      {/* Story */}
      <section id="story" className="mx-auto max-w-5xl scroll-mt-16 px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 sm:items-center">
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
              Our story
            </h2>
            <p className="text-brand-800/80 dark:text-brand-100/70">
              Pepper Pan started with a simple idea: bring the bold, comforting
              flavors of Taiwanese street food to our neighborhood, made the
              same way you&apos;d find it at a night market stall — fresh,
              fast, and full of flavor.
            </p>
            <p className="text-brand-800/80 dark:text-brand-100/70">
              Every dish is made in-house daily, from our marinated Ji Pai to
              our hand-shaken milktea. No shortcuts, just good food made with
              care.
            </p>
          </div>
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-300 to-brand-600 dark:from-brand-800 dark:to-brand-600">
            <div className="flex h-full w-full items-center justify-center p-8 text-center text-brand-50/90">
              <span className="text-lg font-medium">
                📸 Your photo here — send it over and we&apos;ll drop it in.
              </span>
            </div>
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
              To bring the vibrant flavors and comforting warmth of Taiwanese
              street food to our community, made fresh every single day.
            </p>
          </div>
          <div className="rounded-2xl border border-brand-200/60 bg-white/60 p-8 dark:border-brand-800 dark:bg-brand-900/60">
            <h3 className="text-xl font-semibold text-brand-950 dark:text-brand-50">
              Our vision
            </h3>
            <p className="mt-3 text-brand-800/80 dark:text-brand-100/70">
              To become the neighborhood&apos;s go-to spot for authentic,
              affordable Taiwanese bites and milktea.
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
          <p className="mt-3 text-brand-800/80 dark:text-brand-100/70">
            Address and hours coming soon — check back here or follow us on
            social media for the latest.
          </p>
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
