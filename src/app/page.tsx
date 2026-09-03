import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FaqAccordion } from "@/components/faq-accordion";
import { FaqSchema } from "@/components/faq-schema";
import { HeroVideo } from "@/components/hero-video";
import { Reveal } from "@/components/reveal";
import { Parallax } from "@/components/parallax";
import { Marquee } from "@/components/marquee";
import { CountUp } from "@/components/count-up";
import { WhyUs } from "@/components/why-us";
import { FanFavorites } from "@/components/fan-favorites";
import { ReviewCarousel } from "@/components/review-carousel";
import { SocialLinks } from "@/components/social-links";
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
import { getLiveAnnouncements } from "@/lib/announcements-server";
import { getSiteFaqs } from "@/lib/faq-site-server";
import { AnnouncementMedia } from "@/components/announcement-media";
import { hasMedia } from "@/lib/announcements";
import { stripItems } from "@/lib/announcements";
import { getSchedule } from "@/lib/hours-server";
import { DAY_NAMES, formatClock } from "@/lib/hours";
import { isConfigured } from "@/lib/auth";
import { ShopSchema } from "@/components/shop-schema";

const ADDRESS =
  "In front of Palengkeni (New Apalit Public Market), beside Osave!, Apalit, Philippines";
const PHONE = "+63 947 353 3060";
const PHONE_HREF = "+639473533060";
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `Pepper Pan, ${ADDRESS}`
)}`;

/** A date the way the stall says it, in the stall's own timezone. */
function manilaDate(iso: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

const IMG_BASE =
  "https://djxcwbxahmtoglinsaaz.supabase.co/storage/v1/object/public/PepperPan";

/**
 * What fills the hero.
 *
 * The still is not a placeholder to be deleted when the video lands — it stays
 * as the poster underneath it, and it is what anyone on a slow connection, a
 * data saver, or a phone set to reduce motion actually sees. So it has to be a
 * frame worth looking at on its own.
 *
 * Set HERO_VIDEO to a URL and the video layers itself on top. Nothing else in
 * this file changes: that is the whole reason the two are separate constants
 * rather than one branching component.
 */
const HERO_STILL = `${IMG_BASE}/opt/4.webp`;
const HERO_VIDEO: string | null = null;

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


/**
 * Rebuilt on a timer as well as on demand.
 *
 * Saving a promo in HQ busts this page immediately, which covers a promo going
 * up. It cannot cover one coming down: a promo that ends tonight has nobody
 * saving anything at midnight, and the whole reason for the end date is that
 * nobody has to. So the page also re-renders on its own, and the window is
 * re-checked by the database on each of those reads.
 */
export const revalidate = 60;

export default async function Home() {
  const [menuCount, schedule, announcements, siteFaqs] = await Promise.all([
    getMenuCount(),
    getSchedule(),
    getLiveAnnouncements(),
    getSiteFaqs(),
  ]);
  // Real reviews when there are any; the original invitation copy otherwise,
  // so a new shop never shows an empty or invented testimonial.
  const { reviews, average, count: reviewCount } = isConfigured()
    ? await getPublicReviews(24)
    : { reviews: [], average: 0, count: 0 };
  // Enough to keep the carousel from repeating within one visit, without
  // shipping the whole review history to every homepage.
  const featured = reviews.filter((r) => r.comment && r.rating >= 4).slice(0, 8);


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
      <section className="under-nav grain relative flex min-h-[34rem] flex-col justify-end overflow-hidden bg-ink-950 sm:min-h-[38rem] lg:min-h-[44rem]">
        {/* The media, edge to edge behind everything.

            The still is server-rendered and `priority`, so it is what arrives
            first and what a customer on stall wifi actually sees. The video,
            when there is one, fades in over it once it can play — never
            instead of it. See hero-video.tsx for why that ordering matters. */}
        <div aria-hidden className="absolute inset-0">
          <Image
            src={HERO_STILL}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
          {HERO_VIDEO && <HeroVideo src={HERO_VIDEO} />}
        </div>

        {/* Two scrims, doing two different jobs.

            The first knocks the whole frame back so gold type has something to
            sit on wherever the video happens to be bright. The second is the
            heavy one: it turns the bottom of the section into near-solid ink,
            which is what lets the headline cross the video's lower edge and
            stay readable on every frame of a clip I have not seen yet. Tuning
            the type to one frame would break on the next. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-ink-950/35"
        />
        {/* Under the navigation. The media now runs to the very top edge, so
            the logo and the nav links sit on whatever the media happens to be
            showing — on the phone that was bright noodles under white text.
            This is not for one photo: a video will put a different frame up
            there every second, and the nav has to stay readable through all
            of them. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink-950/85 via-ink-950/45 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[85%] bg-gradient-to-t from-ink-950 via-ink-950/80 to-transparent"
        />

        <div className="relative mx-auto w-full max-w-7xl px-6 pb-12 pt-32 sm:pb-14 sm:pt-40 lg:pb-16">
          <Reveal>
            <h1 className="font-display text-[2.55rem] font-black leading-[0.92] tracking-tight text-cream-50 [text-wrap:balance] sm:text-6xl lg:text-7xl xl:text-[5.6rem]">
              Home of Taiwan-Style
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

          {/* Buttons and the line, on one row where there is room for it.
              The tagline replaced a three-line paragraph saying the same
              thing — under a headline this size, a paragraph is the thing
              nobody reads. */}
          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-col gap-5 sm:mt-9 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <Link
                  href="/menu"
                  className="rounded-full bg-gold-400 px-7 py-3.5 font-bold text-ink-950 transition-transform hover:scale-105"
                >
                  View Menu →
                </Link>
                <a
                  href="#story"
                  className="rounded-full border border-cream-100/25 px-7 py-3.5 font-semibold text-cream-50 transition-colors hover:border-gold-400 hover:text-gold-400"
                >
                  Our Story
                </a>
              </div>

              <p className="font-display text-lg font-black uppercase tracking-[0.08em] text-cream-50/85 sm:text-xl lg:text-2xl">
                No passport required.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Marquee ticker — the shop's own words, set in HQ. Falls back to the
          five lines it has always shown when no promo is running, because an
          empty red band reads as a page that failed to load. */}
      <Marquee
        className="border-y-4 border-ink-950 bg-brand-600 py-4 font-display text-xl font-black uppercase tracking-tight text-cream-50 sm:text-2xl"
        items={stripItems(announcements.promos)}
        separator="🌶"
      />

      {/* ---------------------------------------------------------- */}
      {/* What's on — promos with something to explain, and news      */}
      {/*                                                             */}
      {/* Only promos with something more to say than their title —   */}
      {/* a description or a picture. A promo whose whole content is  */}
      {/* its title has already been read in the strip above, and     */}
      {/* repeating it as a card would turn the shop's standing lines */}
      {/* into five empty boxes. The section disappears entirely when */}
      {/* there is nothing to show.                                   */}
      {/* ---------------------------------------------------------- */}
      {(announcements.promoCards.length > 0 || announcements.news.length > 0) && (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            {announcements.promoCards.length > 0 && (
              <div>
                <Reveal className="mb-6">
                  <SectionMark
                    art={<Chili className="h-full w-full" />}
                    className="text-brand-600"
                  >
                    On right now
                  </SectionMark>
                  <h2 className="mt-2 font-display text-4xl font-black tracking-tight text-ink-950">
                    What&apos;s on
                  </h2>
                </Reveal>
                <div className="grid gap-4 sm:grid-cols-2">
                  {announcements.promoCards.map((p, i) => (
                    <Reveal key={p.id} delay={i * 0.06} className="h-full">
                      {/* The whole card is the link. A "read more" the size of
                          two words, inside a card that is itself the thing
                          under the thumb, is a link most people never hit. */}
                      <Link
                        href={`/news/${p.id}`}
                        className="group flex h-full flex-col overflow-hidden rounded-3xl border-4 border-ink-950 bg-brand-600 shadow-[6px_6px_0_0_theme(colors.ink.950)] transition-transform hover:-translate-y-1"
                      >
                        {hasMedia(p) && (
                          <AnnouncementMedia
                            row={p}
                            className="h-40 w-full bg-ink-950 object-cover"
                          />
                        )}
                        <div className="flex flex-1 flex-col p-6">
                          <h3 className="font-display text-2xl font-black uppercase leading-tight tracking-tight text-cream-50">
                            {p.title}
                          </h3>
                          {p.body && (
                            <p className="mt-2 line-clamp-3 text-sm font-medium text-cream-100/80">
                              {p.body}
                            </p>
                          )}
                          <p className="mt-auto pt-4 text-xs font-black uppercase tracking-widest text-gold-300 group-hover:underline">
                            {p.ends_at ? `Until ${manilaDate(p.ends_at)} · ` : ""}Read more →
                          </p>
                        </div>
                      </Link>
                    </Reveal>
                  ))}
                </div>
              </div>
            )}

            {announcements.news.length > 0 && (
              <div>
                <Reveal className="mb-6">
                  <SectionMark
                    art={<ChatSteam className="h-full w-full" />}
                    className="text-jade-600"
                  >
                    From the stall
                  </SectionMark>
                  <h2 className="mt-2 font-display text-4xl font-black tracking-tight text-ink-950">
                    News
                  </h2>
                </Reveal>
                <ul className="flex flex-col gap-3">
                  {announcements.news.map((n, i) => (
                    <li key={n.id}>
                      <Reveal delay={i * 0.06}>
                        <Link
                          href={`/news/${n.id}`}
                          className="group flex gap-4 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10 transition-colors hover:bg-gold-50 hover:ring-gold-400"
                        >
                          {hasMedia(n) && (
                            <AnnouncementMedia
                              row={n}
                              className="h-16 w-16 shrink-0 rounded-xl bg-ink-950 object-cover"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-widest text-ink-800/40">
                              {manilaDate(n.starts_at ?? n.created_at)}
                            </p>
                            <h3 className="mt-1 font-display text-lg font-black text-ink-950 group-hover:underline">
                              {n.title}
                            </h3>
                            {n.body && (
                              <p className="mt-1 line-clamp-2 text-sm text-ink-800/70">
                                {n.body}
                              </p>
                            )}
                          </div>
                        </Link>
                      </Reveal>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/news"
                  className="mt-4 inline-block text-sm font-black uppercase tracking-widest text-brand-600 hover:underline"
                >
                  All news &amp; promos →
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

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
      {/* The gold band: dine-in special, and what's coming           */}
      {/*                                                             */}
      {/* Both lines were hardcoded here for months, which meant the  */}
      {/* free coffee could not be ended and the chicken wings could  */}
      {/* not arrive without a deploy. Both are rows now, written in  */}
      {/* HQ, and the band disappears when the shop has neither to    */}
      {/* say — an empty gold stripe is worse than no stripe.         */}
      {/* ---------------------------------------------------------- */}
      {(announcements.dineIn || announcements.comingSoon.length > 0) && (
        <section className="grain relative overflow-hidden bg-brand-600 py-16">
          <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 sm:flex-row sm:items-center sm:justify-between">
            <Reveal direction="right" className="min-w-0 flex-1">
              {announcements.dineIn && (
                <>
                  <span className="text-xs font-bold uppercase tracking-widest text-gold-300">
                    Dine-in special
                  </span>
                  <p className="mt-2 font-display text-3xl font-black leading-tight text-cream-50 sm:text-4xl">
                    {announcements.dineIn.title}
                  </p>
                  {announcements.dineIn.body && (
                    <p className="mt-2 max-w-xl text-cream-100/80">
                      {announcements.dineIn.body}
                    </p>
                  )}
                </>
              )}

            </Reveal>

            {announcements.dineIn && hasMedia(announcements.dineIn) && (
              <Reveal delay={0.05} className="w-full sm:w-56 lg:w-64">
                <AnnouncementMedia
                  row={announcements.dineIn}
                  className="aspect-[4/3] w-full rounded-3xl border-4 border-ink-950 bg-ink-950 object-cover shadow-[6px_6px_0_0_theme(colors.ink.950)]"
                />
              </Reveal>
            )}

            <Reveal direction="left" delay={0.1} className="shrink-0">
              <Link
                href="/menu"
                className="inline-block whitespace-nowrap rounded-full bg-ink-950 px-8 py-4 font-bold text-cream-50 transition-transform hover:scale-105"
              >
                Order now →
              </Link>
            </Reveal>
          </div>

          {/* Coming soon, given room of its own.
              It used to be a half-line of text with a thumbnail the size of a
              postage stamp, tucked under the dine-in offer — which is a strange
              way to treat the thing the shop is most excited about. Title, then
              the picture, then what it is.

              Two of them, side by side. What is arriving is usually a pair, and
              announcing them one at a time makes the second look like an
              afterthought. The heading is written once above both: repeating
              "Coming soon" over each card would say it twice and mean it less. */}
          {announcements.comingSoon.length > 0 && (
            <Reveal
              delay={0.15}
              className="relative mx-auto mt-12 max-w-6xl border-t-2 border-cream-50/25 px-6 pt-10"
            >
              <p className="font-display text-sm font-black uppercase tracking-[0.2em] text-gold-300 sm:text-base">
                Coming soon
              </p>

              <div
                className={`mt-6 grid gap-10 ${
                  announcements.comingSoon.length > 1
                    ? "sm:grid-cols-2"
                    : "max-w-2xl"
                }`}
              >
                {announcements.comingSoon.map((row) => (
                  <article key={row.id}>
                    <h3 className="font-display text-2xl font-black leading-tight text-cream-50 sm:text-3xl">
                      {row.title}
                    </h3>

                    {hasMedia(row) && (
                      <AnnouncementMedia
                        row={row}
                        className="mt-5 aspect-[16/10] w-full rounded-3xl border-4 border-ink-950 bg-ink-950 object-cover shadow-[8px_8px_0_0_theme(colors.ink.950)]"
                      />
                    )}

                    {row.body && (
                      <p className="mt-5 text-base font-medium leading-relaxed text-cream-100/85 sm:text-lg">
                        {row.body}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </Reveal>
          )}
        </section>
      )}

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

            <ReviewCarousel reviews={featured} />

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
          {/* Two flat colour blocks with a line of text each, and a lot of
              nothing under it. Both now carry the dish they're about as a
              watermark, and the text sits against it rather than floating in
              an empty field — the same trick the section marks use elsewhere,
              so the page reads as one thing. */}
          <Reveal direction="right">
            <article className="grain relative flex h-full flex-col overflow-hidden rounded-3xl bg-jade-700 p-10 text-cream-50">
              {/* Decorative: `spot-art` marks already carry aria-hidden when
                  given no title, so there's nothing to add here. */}
              <NoodleBowl className="pointer-events-none absolute -bottom-8 -right-8 h-48 w-48 text-cream-50/10" />
              <span className="relative inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-jade-200">
                <span className="h-px w-6 bg-jade-200/60" />
                Our mission
              </span>
              <p className="relative mt-5 font-display text-2xl font-bold leading-snug sm:text-[1.75rem]">
                Bring the bold flavors of Taiwan-style food to our community in
                Apalit — made fresh every single day.
              </p>
              <p className="relative mt-auto pt-8 text-sm text-cream-100/70">
                Cooked to order, never held under a lamp.
              </p>
            </article>
          </Reveal>
          <Reveal direction="left" delay={0.1}>
            <article className="grain relative flex h-full flex-col overflow-hidden rounded-3xl bg-ink-950 p-10 text-cream-50">
              <Chili className="pointer-events-none absolute -bottom-6 -right-6 h-44 w-44 text-gold-400/25" />
              <span className="relative inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold-400">
                <span className="h-px w-6 bg-gold-400/60" />
                Our vision
              </span>
              <p className="relative mt-5 font-display text-2xl font-bold leading-snug sm:text-[1.75rem]">
                To be the neighborhood&apos;s go-to spot for Taiwan-style
                cravings — no flight required.
              </p>
              <p className="relative mt-auto pt-8 text-sm text-cream-100/70">
                One stall in Apalit, and a queue that keeps coming back.
              </p>
            </article>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Visit                                                       */}
      {/* ---------------------------------------------------------- */}
      <section id="visit" className="scroll-mt-24 bg-cream-100 py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-16">
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
            <div className="mt-8 flex flex-wrap gap-3">
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
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-widest text-ink-800/50">
                Follow us
              </span>
              <SocialLinks tone="light" />
            </div>
          </Reveal>

          {/* The right half of this section was empty, and the one question a
              "come see us" block has to answer — are they open, and when —
              wasn't on the page at all. The shop already keeps these hours for
              its own scheduling, so this is the same data the checkout uses,
              not a second copy to keep in step. */}
          {schedule.configured && schedule.hours.length > 0 && (
            <Reveal delay={0.1}>
              <div className="rounded-3xl bg-cream-50 p-6 shadow-xl shadow-ink-950/5 ring-1 ring-ink-950/10 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-black text-ink-950">
                    Opening hours
                  </h3>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
                      schedule.state.isOpen
                        ? "bg-jade-600 text-cream-50"
                        : "bg-ink-950/10 text-ink-800"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        schedule.state.isOpen
                          ? "animate-pulse bg-cream-50"
                          : "bg-ink-800/40"
                      }`}
                    />
                    {schedule.state.isOpen ? "Open now" : "Closed"}
                  </span>
                </div>

                {!schedule.state.isOpen &&
                  (schedule.state.opensNext || schedule.state.reason) && (
                    <p className="mt-3 rounded-2xl bg-gold-400/20 px-4 py-2.5 text-sm font-semibold text-ink-800">
                      {schedule.state.opensNext ?? schedule.state.reason}
                    </p>
                  )}

                <ul className="mt-5 flex flex-col">
                  {schedule.hours.map((day) => {
                    const isToday =
                      schedule.state.today?.weekday === day.weekday;
                    return (
                      <li
                        key={day.weekday}
                        className={`flex items-center justify-between gap-4 rounded-xl px-3 py-2 text-sm ${
                          isToday
                            ? "bg-ink-950 font-bold text-cream-50"
                            : "text-ink-800/80"
                        }`}
                      >
                        <span>{DAY_NAMES[day.weekday]}</span>
                        <span
                          className={
                            day.is_open
                              ? "tabular-nums"
                              : isToday
                                ? "text-cream-100/60"
                                : "text-ink-800/40"
                          }
                        >
                          {day.is_open
                            ? `${formatClock(day.opens)} – ${formatClock(day.closes)}`
                            : "Closed"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Reveal>
          )}
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
          <FaqSchema faqs={siteFaqs} />
          <FaqAccordion items={siteFaqs} />
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
