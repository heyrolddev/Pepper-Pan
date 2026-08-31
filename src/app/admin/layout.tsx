import { redirect } from "next/navigation";
import { getViewer, isConfigured, isStaff } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";

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

  return (
    <AdminShell email={viewer.email} role={viewer.profile?.role ?? "staff"}>
      {children}
    </AdminShell>
  );
}
