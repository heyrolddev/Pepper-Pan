import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer, isConfigured, isStaff } from "@/lib/auth";
import { checkDevice } from "@/lib/devices-server";
import { DEVICE_COOKIE } from "@/lib/devices";
import { DeviceWaiting } from "@/components/device-waiting";
import { AdminShell } from "@/components/admin-shell";
import { getAdminBadges } from "@/lib/admin-badges";
import { openShiftFor } from "@/lib/shifts-server";

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
