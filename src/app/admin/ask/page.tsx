import { can, getViewer } from "@/lib/auth";
import { HqAssistant } from "@/components/hq-assistant";
import { hqTitle } from "@/lib/hq-theme";

// Every answer is worked out when it is asked, from the figures as they stand
// at that moment. A cached explanation of last week's profit is a wrong one.
export const dynamic = "force-dynamic";

export default async function AskHqPage() {
  const viewer = await getViewer();
  if (!can(viewer, "assistant")) {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className={hqTitle}>Owner only</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          To explain how a figure was arrived at, this has to read the figure —
          costs, margins, the month&apos;s takings. Opening it to a manager
          would hand over the books through the back door, which is the one
          thing the manager role exists to prevent.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className={hqTitle}>Ask HQ</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Everything about this system, in one place you can talk to. What a
          screen is for, how to do something, what a number means — and for
          the money figures, the working, with your own numbers in it.
        </p>
      </div>

      <HqAssistant />
    </div>
  );
}
