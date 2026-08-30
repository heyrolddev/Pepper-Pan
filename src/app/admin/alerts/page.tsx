import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth";
import { pushConfigured } from "@/lib/push";
import { PushToggle } from "@/components/push-toggle";
import { formatDateTime } from "@/lib/format-date";

/**
 * Where the owner decides which phones the shop is allowed to ring.
 *
 * This is the only screen in HQ whose whole job is to work when nobody is
 * looking at HQ.
 */

// The device list is per-person and changes the moment someone taps the
// toggle. Prerendering it would serve one account's devices from a cache —
// wrong for the owner, and wrong in a way that looks like the feature broke.
export const dynamic = "force-dynamic";
export default async function AdminAlertsPage() {
  const viewer = await getViewer();
  const configured = pushConfigured();

  // Own devices only. Read under the service role because this page also
  // needs to survive the migration not having been run yet, and a missing
  // table should read as "nothing set up", not a crash.
  let devices: {
    id: string;
    label: string | null;
    created_at: string;
    last_sent_at: string | null;
  }[] = [];
  let tableMissing = false;
  let readError: string | null = null;

  if (viewer?.profile?.id) {
    const { data, error } = await createAdminClient()
      .from("push_subscriptions")
      .select("id, label, created_at, last_sent_at")
      .eq("user_id", viewer.profile.id)
      .order("created_at", { ascending: false });

    // 42P01 is "that table doesn't exist", which means one thing: the
    // migration hasn't been run. Anything else is a real fault and saying
    // "run the migration" would send the owner down the wrong path — the
    // failure mode this codebase has been bitten by before.
    if (error?.code === "42P01") tableMissing = true;
    else if (error) readError = error.message;
    else devices = data ?? [];
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-black text-ink-950">Alerts</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Ang tanging paraan para malaman mong may bagong order habang hindi mo
          nakabukas ang HQ. Walang bayad ito — walang SMS load, walang
          subscription.
        </p>
      </div>

      {tableMissing ? (
        <div className="rounded-3xl bg-gold-50 p-8 ring-1 ring-gold-400/40">
          <p className="font-display text-xl font-black text-ink-950">
            Isang hakbang na lang
          </p>
          <p className="mt-2 max-w-xl text-sm text-ink-800/70">
            Patakbuhin ang <strong>migration 0014</strong> sa Supabase SQL
            Editor para mabuksan ito.
          </p>
        </div>
      ) : readError ? (
        <div className="rounded-3xl bg-brand-50 p-8 ring-1 ring-brand-600/40">
          <p className="font-display text-xl font-black text-brand-700">
            Hindi mabasa ang mga device
          </p>
          <p className="mt-2 max-w-xl font-mono text-sm text-ink-800/70">
            {readError}
          </p>
        </div>
      ) : (
        <PushToggle
          audience="owner"
          vapidKey={
            configured ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null) : null
          }
        />
      )}

      {devices.length > 0 && (
        <section>
          <h3 className="font-display text-lg font-black text-ink-950">
            Mga device na tinutunog
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream-100 px-5 py-3 ring-1 ring-ink-950/10"
              >
                <span className="text-sm font-semibold text-ink-950">
                  {d.label ?? "Isang device"}
                </span>
                <span className="text-xs text-ink-800/50">
                  {d.last_sent_at
                    ? `Huling tinunog ${formatDateTime(d.last_sent_at)}`
                    : `Naka-on mula ${formatDateTime(d.created_at)}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-800/50">
            Para patayin ang isang device, buksan ang page na ito doon mismo at
            pindutin ang &ldquo;Turn off&rdquo; — para hindi mo maaksidenteng
            mapatay ang phone na hawak mo ngayon.
          </p>
        </section>
      )}

      <section className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10">
        <h3 className="font-display text-lg font-black text-ink-950">
          Ano ang ipapadala nito
        </h3>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-800/70">
          <li>
            <strong>Sa&apos;yo:</strong> bawat bagong order — pangalan, halaga,
            pickup o delivery, at kung advance order ba.
          </li>
          <li>
            <strong>Sa customer:</strong> confirmed, handa na, papunta na, at
            kanselado. Wala nang iba — walang promo, walang paulit-ulit.
          </li>
        </ul>
      </section>
    </div>
  );
}
