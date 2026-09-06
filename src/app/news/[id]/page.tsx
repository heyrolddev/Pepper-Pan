import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementMedia, hasMedia } from "@/components/announcement-media";
import { Chili, NoodleBowl } from "@/components/spot-art";
import { getAnnouncement } from "@/lib/announcements-server";
import { longDate, windowText } from "@/lib/announcement-format";

// The window is checked by the database on every read, so the page has to be
// re-fetched for a finished promo to start 404ing.
export const revalidate = 60;

/** Only ever a whole number; anything else was never one of ours. */
function idOf(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

export async function generateMetadata({ params }: PageProps<"/news/[id]">) {
  const { id } = await params;
  const n = idOf(id);
  const row = n === null ? null : await getAnnouncement(n);
  if (!row) return { title: "Not found · Pepper Pan" };
  return {
    title: `${row.title} · Pepper Pan`,
    description: row.body ?? "From the stall at Pepper Pan.",
    openGraph: {
      title: row.title,
      description: row.body ?? undefined,
      images: row.image_url ? [row.image_url] : undefined,
    },
  };
}

export default async function AnnouncementPage({ params }: PageProps<"/news/[id]">) {
  const { id } = await params;
  const n = idOf(id);
  const row = n === null ? null : await getAnnouncement(n);

  // Not found and no longer running come to the same thing on purpose: a promo
  // that finished should not keep a live page a customer can wave at the till.
  if (!row) notFound();

  const when = windowText(row.starts_at, row.ends_at);

  // Every kind has a page here, including the two that only ever appeared
  // inside the homepage's band — so the badge has to name all four rather
  // than calling a Coming soon post "News".
  const badge: Record<typeof row.kind, { label: string; chip: string }> = {
    promo: { label: "Promo", chip: "bg-brand-600 text-cream-50" },
    news: { label: "News", chip: "bg-jade-600 text-cream-50" },
    coming_soon: { label: "Coming soon", chip: "bg-gold-400 text-ink-950" },
    dine_in: { label: "Dine-in special", chip: "bg-ink-950 text-gold-400" },
  };
  const kind = badge[row.kind] ?? badge.news;

  return (
    /**
     * A sheet on a textured ground, rather than text on a blank page.
     *
     * This was a column of type centred on flat cream, which reads as an
     * unfinished draft however good the writing is. The brief was "graphics,
     * but do not slow the site down", so nothing here is a photograph, a font
     * or a request:
     *
     *   The speckle is one CSS radial-gradient tiled at 22px. No image, no
     *   file, no bytes beyond the rule itself.
     *
     *   The two marks are the shop's own inline SVG line art, already in the
     *   bundle and used on the homepage. A few hundred bytes each, drawn in
     *   `currentColor`, so tinting them is one class.
     *
     *   The post itself sits on a bordered, offset-shadow sheet — the same
     *   construction as the cards that link here, so arriving from one does
     *   not feel like arriving at a different website.
     *
     * All of it is `pointer-events-none` and `aria-hidden`: decoration that
     * can be clicked, or read aloud, has stopped being decoration.
     */
    <main className="under-nav relative flex-1 overflow-hidden bg-cream-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(18 10 8 / 0.055) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      {/* Bleeding off the edges on purpose — a mark fully inside the page
          reads as a sticker, one that runs off reads as printed stock. */}
      <Chili
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-16 h-80 w-80 rotate-12 text-brand-600/[0.07]"
      />
      <NoodleBowl
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 hidden h-96 w-96 -rotate-12 text-ink-950/[0.05] lg:block"
      />

      <article className="relative mx-auto max-w-3xl px-6 py-14">
        <Link
          href="/news"
          className="text-xs font-black uppercase tracking-widest text-ink-800/50 transition-colors hover:text-brand-600"
        >
          ← News &amp; promos
        </Link>

        <div className="mt-6 rounded-3xl border-4 border-ink-950 bg-cream-50 p-6 shadow-[8px_8px_0_0_theme(colors.ink.950)] sm:p-10">
        <p className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest ${kind.chip}`}
          >
            {kind.label}
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-800/45">
            {longDate(row.starts_at ?? row.created_at)}
          </span>
        </p>

        <h1 className="mt-3 font-display text-4xl font-black leading-tight tracking-tight text-ink-950 sm:text-5xl">
          {row.title}
        </h1>

        {when && (
          <p className="mt-3 inline-block rounded-xl bg-ink-950/5 px-4 py-2 text-sm font-bold text-ink-800/70">
            {when}
          </p>
        )}

        {hasMedia(row) && (
          <div className="mt-8 overflow-hidden rounded-3xl border-4 border-ink-950 bg-ink-950">
            <AnnouncementMedia row={row} full className="max-h-[70vh] w-full object-contain" />
          </div>
        )}

        {row.body && (
          // Written in a textarea, so line breaks are what the author meant.
          // Rendering them away is how a three-paragraph notice becomes a wall.
          <div className="mt-8 whitespace-pre-line text-lg leading-relaxed text-ink-800/85">
            {row.body}
          </div>
        )}

        <div className="mt-10 flex flex-wrap gap-3 border-t-2 border-ink-950/10 pt-8">
          <Link
            href="/menu"
            className="rounded-full bg-ink-950 px-7 py-3.5 font-bold text-gold-400 transition-transform hover:scale-105"
          >
            See the menu →
          </Link>
          <Link
            href="/news"
            className="rounded-full border-2 border-ink-950/15 px-7 py-3.5 font-semibold text-ink-950 transition-colors hover:border-ink-950"
          >
            Everything else
          </Link>
        </div>
        </div>
      </article>
    </main>
  );
}
