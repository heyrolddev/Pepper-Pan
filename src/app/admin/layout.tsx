import { redirect } from "next/navigation";
import { getViewer, isConfigured, isStaff } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";

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
    <main className="flex-1">
      <div className="under-nav grain relative overflow-hidden bg-ink-950 pb-6">
        <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-6xl px-6 pt-10">
          <p className="text-xs font-bold uppercase tracking-widest text-gold-400">
            Shop admin
          </p>
          <h1 className="mt-1 font-display text-3xl font-black text-cream-50">
            Pepper Pan HQ
          </h1>
          <p className="mt-1 text-sm text-cream-100/60">
            Signed in as {viewer.email} · {viewer.profile?.role}
          </p>
          <AdminNav />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </main>
  );
}
