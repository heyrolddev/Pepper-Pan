import { can, getViewer } from "@/lib/auth";
import { getAllAnnouncements } from "@/lib/announcements-server";
import { AnnouncementEditor } from "@/components/announcement-editor";
import { hqTitle } from "@/lib/hq-theme";

// What is live depends on the clock — a promo scheduled for tomorrow has to
// read as "Scheduled" today and "On the homepage" tomorrow, without a deploy.
export const dynamic = "force-dynamic";

export default async function AdminPromosPage() {
  const viewer = await getViewer();
  if (!can(viewer, "announcements")) {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className={hqTitle}>Owner and manager only</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          This is what the shop says in public on its own homepage, so it is
          kept to the people who answer for it.
        </p>
      </div>
    );
  }

  const { rows, error } = await getAllAnnouncements();

  if (error) {
    return (
      <div className="rounded-3xl bg-gold-50 p-8 ring-1 ring-gold-400/40">
        <h2 className={hqTitle}>Promos &amp; news</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          Run <strong>migration 0025</strong> in the Supabase SQL Editor to
          switch this on. It is what lets you change the scrolling strip on the
          homepage without a code change.
        </p>
        <p className="mt-3 rounded-xl bg-cream-50 px-4 py-2 font-mono text-xs text-ink-800/70">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className={hqTitle}>Promos &amp; news</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          This is the homepage talking. A <strong>promo</strong> scrolls across
          the top and shows as a card; <strong>news</strong> is the dated stuff
          — a closure, a new dish, a change of hours. Give either one an end
          date and it takes itself down, so a promo that finished on Sunday
          isn&apos;t still being honoured on Wednesday.
        </p>
      </div>

      <AnnouncementEditor rows={rows} />
    </div>
  );
}
