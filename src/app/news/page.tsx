import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/reveal";
import { AnnouncementMedia, hasMedia } from "@/components/announcement-media";
import { getPublicFeed } from "@/lib/announcements-server";
import { shortDate, windowText } from "@/lib/announcement-format";
import type { Announcement } from "@/lib/announcements";

export const metadata = {
  title: "News & promos · Pepper Pan",
  description: "What's running at the stall right now, and what's new.",
};

// Same reason as the homepage: a promo whose window closes tonight has to come
// off without anybody saving anything.
export const revalidate = 60;

export default async function NewsPage() {
  const { promos, news } = await getPublicFeed();
  const empty = promos.length === 0 && news.length === 0;

  return (
    <main className="flex-1">
      <PageHeader
        eyebrow="From the stall"
        title="News & promos"
        subtitle="What's running right now, and anything worth knowing before you come."
        compact
      />

      <div className="mx-auto max-w-5xl px-6 py-16">
        {empty ? (
          <p className="rounded-3xl bg-cream-100 p-8 text-center text-ink-800/70 ring-1 ring-ink-950/10">
            Nothing running at the moment — but the kitchen is. Have a look at{" "}
            <Link href="/menu" className="font-bold text-brand-600 underline">
              the menu
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-14">
            {promos.length > 0 && (
              <section>
                <h2 className="font-display text-3xl font-black tracking-tight text-ink-950">
                  What&apos;s on
                </h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {promos.map((p, i) => (
                    <Reveal key={p.id} delay={i * 0.05}>
                      <Card row={p} tone="promo" />
                    </Reveal>
                  ))}
                </div>
              </section>
            )}

            {news.length > 0 && (
              <section>
                <h2 className="font-display text-3xl font-black tracking-tight text-ink-950">
                  News
                </h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {news.map((n, i) => (
                    <Reveal key={n.id} delay={i * 0.05}>
                      <Card row={n} tone="news" />
                    </Reveal>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * The whole card is the link.
 *
 * Not a "Read more" at the bottom: on a phone the card is the thing under the
 * thumb, and a link the size of two words inside it is a link most people miss.
 */
function Card({ row, tone }: { row: Announcement; tone: "promo" | "news" }) {
  const when = windowText(row.starts_at, row.ends_at);
  const promo = tone === "promo";
  return (
    <Link
      href={`/news/${row.id}`}
      className={`group flex h-full flex-col overflow-hidden rounded-3xl border-4 border-ink-950 transition-transform hover:-translate-y-1 ${
        promo ? "bg-gold-400" : "bg-cream-100"
      } shadow-[6px_6px_0_0_theme(colors.ink.950)]`}
    >
      {hasMedia(row) && (
        <AnnouncementMedia row={row} className="h-44 w-full bg-ink-950 object-cover" />
      )}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-ink-950/50">
          {promo ? "Promo" : shortDate(row.starts_at ?? row.created_at)}
        </p>
        <h3
          className={`mt-1 font-display font-black leading-tight text-ink-950 ${
            promo ? "text-2xl uppercase" : "text-xl"
          }`}
        >
          {row.title}
        </h3>
        {row.body && (
          <p className="mt-2 line-clamp-3 text-sm text-ink-950/70">{row.body}</p>
        )}
        <p className="mt-auto pt-4 text-xs font-black uppercase tracking-widest text-brand-700 group-hover:underline">
          {when ? `${when} · Read more →` : "Read more →"}
        </p>
      </div>
    </Link>
  );
}
