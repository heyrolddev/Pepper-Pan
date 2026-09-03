import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementMedia, hasMedia } from "@/components/announcement-media";
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
  const isPromo = row.kind === "promo";

  return (
    <main className="under-nav flex-1 bg-cream-50">
      <article className="mx-auto max-w-3xl px-6 py-14">
        <Link
          href="/news"
          className="text-xs font-black uppercase tracking-widest text-ink-800/50 transition-colors hover:text-brand-600"
        >
          ← News &amp; promos
        </Link>

        <p className="mt-8 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest ${
              isPromo ? "bg-brand-600 text-cream-50" : "bg-jade-600 text-cream-50"
            }`}
          >
            {isPromo ? "Promo" : "News"}
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

        <div className="mt-12 flex flex-wrap gap-3 border-t border-ink-950/10 pt-8">
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
      </article>
    </main>
  );
}
