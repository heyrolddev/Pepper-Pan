import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer, isConfigured, isStaff } from "@/lib/auth";
import { checkDevice } from "@/lib/devices-server";
import { DEVICE_COOKIE } from "@/lib/devices";
import { DeviceWaiting } from "@/components/device-waiting";
import { AdminShell } from "@/components/admin-shell";
import { getAdminBadges } from "@/lib/admin-badges";
import { closeStaleShifts, openShiftFor, shiftLength, STALE_SHIFT_HOURS } from "@/lib/shifts-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushToOwners } from "@/lib/push";

import { privatePage } from "@/lib/seo";

export const metadata = privatePage("HQ");

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isConfigured()) redirect("/");

  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/admin");

  // Every /admin page is gated here, and the underlying tables are also
  // protected by RLS — so a non-staff session can't read this data even if
  // it somehow reached the route.
  if (!isStaff(viewer)) redirect("/");

  // One device per manager or staff member; the owner is never gated, or a
  // new phone in their pocket would lock the whole shop out with nobody left
  // who could let anyone back in.
  //
  // Checked in the layout rather than in middleware because it needs the
  // person's role, and reading a role means reading the database — which
  // middleware runs on every asset request and should not do.
  const role = viewer.profile?.role ?? "staff";
  if (viewer.profile?.id) {
    const deviceId = (await cookies()).get(DEVICE_COOKIE)?.value;
    const status = deviceId
      ? await checkDevice(
          viewer.profile.id,
          deviceId,
          (await headers()).get("user-agent"),
          role
        )
      : // No cookie means cookies are blocked. Treated as "ask", not as
        // "allow": the whole check would otherwise be skippable by refusing
        // one cookie.
        "pending";

    if (status !== "approved") {
      return <DeviceWaiting declined={status === "declined"} />;
    }
  }

  // Fetched in the layout rather than per page, so the counts are the same on
  // every screen — a sidebar that says "3 orders" on one page and "1" on the
  // next is worse than one that says nothing.
  /**
   * Shifts nobody clocked out of get closed here, before the clock is read.
   *
   * Before, that ran first and this second — which would have shown the person
   * still on a shift the same request had just closed. Opening HQ is the only
   * regular heartbeat this project has: there is no cron, and a stale shift is
   * now a key to the whole shop floor rather than a wrong number in a report.
   */
  await tidyStaleShifts();

  const [badges, shift] = await Promise.all([
    getAdminBadges(),
    // Fetched here with the badges so the rail can show the clock on every
    // screen — a clock that only exists on one page is one people forget.
    viewer.profile?.id ? openShiftFor(viewer.profile.id) : Promise.resolve(null),
  ]);

  return (
    <AdminShell
      email={viewer.email}
      role={viewer.profile?.role ?? "staff"}
      badges={badges}
      shiftStartedAt={shift?.started_at ?? null}
    >
      {children}
    </AdminShell>
  );
}

/**
 * Close what was left open, and tell the owner rather than tidying quietly.
 *
 * A shift closed by the system is a shift with no drawer count, which is
 * exactly the thing the owner needs to know about — and the person keeps
 * forgetting until somebody mentions it.
 */
async function tidyStaleShifts(): Promise<void> {
  const closed = await closeStaleShifts();
  if (closed.length === 0) return;

  const db = createAdminClient();
  const { data: people } = await db
    .from("profiles")
    .select("id, full_name")
    .in("id", [...new Set(closed.map((s) => s.staff_id))]);
  const nameOf = new Map(
    ((people ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name?.trim() || "Someone",
    ])
  );

  for (const s of closed) {
    const who = nameOf.get(s.staff_id) ?? "Someone";
    await db.from("activity_log").insert({
      category: "shift",
      description:
        `Shift closed automatically after ${STALE_SHIFT_HOURS}h — ` +
        `nobody clocked out, so the drawer was never counted ` +
        `(${shiftLength(s.started_at, s.ended_at)})`,
      actor: s.staff_id,
    });
    await pushToOwners({
      title: `${who} never clocked out`,
      body: `The shift ran ${shiftLength(
        s.started_at,
        s.ended_at
      )} and has been closed. The drawer was never counted.`,
      url: "/admin/staff",
      tag: `shift-stale-${s.id}`,
    });
  }
}
