import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer, isConfigured, isStaff } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { ChefHatIcon } from "@/components/icons";

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
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gold-400 text-ink-950 ring-4 ring-gold-400/20">
              <ChefHatIcon className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-gold-400">
                {viewer.profile?.role === "owner" ? "Owner account" : "Staff account"}
              </p>
              <h1 className="font-display text-3xl font-black text-cream-50">
                Pepper Pan HQ
              </h1>
              <p className="mt-0.5 truncate text-sm text-cream-100/60">
                Signed in as {viewer.email}
              </p>
            </div>

            <Link
              href="/"
              className="ml-auto rounded-full bg-cream-50/10 px-4 py-2 text-sm font-bold text-cream-100 transition-colors hover:bg-cream-50/20"
            >
              View shop ↗
            </Link>
          </div>
          <AdminNav />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </main>
  );
}
