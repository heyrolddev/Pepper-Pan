import { redirect } from "next/navigation";
import { getViewer, isConfigured, isStaff } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";
import { getAdminBadges } from "@/lib/admin-badges";

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

  // Fetched in the layout rather than per page, so the counts are the same on
  // every screen — a sidebar that says "3 orders" on one page and "1" on the
  // next is worse than one that says nothing.
  const badges = await getAdminBadges();

  return (
    <AdminShell
      email={viewer.email}
      role={viewer.profile?.role ?? "staff"}
      badges={badges}
    >
      {children}
    </AdminShell>
  );
}
