import { getViewer } from "@/lib/auth";
import { countResettable } from "./actions";
import { ResetPanel } from "@/components/reset-panel";

// The counts have to be current — deciding what to delete against a cached
// number from an hour ago is the one thing this screen must never do.
export const dynamic = "force-dynamic";

export default async function AdminResetPage() {
  const viewer = await getViewer();

  if (viewer?.profile?.role !== "owner") {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className="font-display text-2xl font-black text-ink-950">
          Owner only
        </h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          Staff can run the shop — take orders, update the menu, reply to
          customers. Clearing the shop&apos;s records is the owner&apos;s
          decision alone.
        </p>
      </div>
    );
  }

  const counts = await countResettable();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-black text-ink-950">
          Start fresh
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Clear the practice data you entered while setting the shop up, so your
          first real month of figures is real. Everything you configured —
          hours, delivery, payments, notifications — stays.
        </p>
      </div>

      <div className="rounded-2xl bg-gold-400/20 px-5 py-4 text-sm text-ink-800/80">
        <strong className="text-ink-950">Do this once, before you open.</strong>{" "}
        After real orders start coming in, this becomes a way to destroy your own
        records — your sales history, what sells, who your regulars are. None of
        it can be recovered.
      </div>

      <ResetPanel counts={counts} />
    </div>
  );
}
