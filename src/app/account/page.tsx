import Link from "next/link";
import { getViewer, isConfigured } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { AccountForm } from "@/components/account-form";
import { getDeliverySettings } from "@/lib/delivery-server";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AccountPage() {
  if (!isConfigured()) {
    return (
      <main className="flex-1">
        <PageHeader title="My Account" />
        <section className="mx-auto max-w-md px-6 py-14">
          <p className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-8 text-center text-ink-800/80">
            Accounts aren&apos;t set up yet.
          </p>
        </section>
      </main>
    );
  }

  const viewer = await getViewer();

  if (!viewer) {
    return (
      <main className="flex-1">
        <PageHeader
          eyebrow="Your details"
          title="My Account"
          subtitle="Sign in to manage your name, number and delivery address."
        />
        <section className="mx-auto max-w-md px-6 py-14 text-center">
          <Link
            href="/login?next=/account"
            className="inline-block rounded-full bg-brand-600 px-8 py-4 font-bold text-cream-50 transition-transform hover:scale-105"
          >
            Sign in →
          </Link>
        </section>
      </main>
    );
  }

  const p = viewer.profile;
  const delivery = await getDeliverySettings();

  return (
    <main className="flex-1">
      <PageHeader
        eyebrow="Your details"
        title="My Account"
        subtitle={viewer.email}
      />

      <section className="mx-auto max-w-md px-6 py-14">
        {p?.is_blocked && (
          <div className="mb-6 rounded-2xl bg-brand-600 px-5 py-4 text-sm font-semibold text-cream-50">
            Ordering is paused on this account. Please contact us at
            +63 947 353 3060 if you think this is a mistake.
          </div>
        )}

        <div
          className={`mb-6 flex items-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold ${
            p?.is_verified
              ? "bg-jade-700 text-cream-50"
              : "bg-cream-100 text-ink-800 ring-1 ring-ink-950/10"
          }`}
        >
          <span className="text-lg">{p?.is_verified ? "✓" : "•"}</span>
          {p?.is_verified ? (
            <span>Verified customer — thanks for ordering with us!</span>
          ) : (
            <span>
              Not yet verified. Complete your details below and place an
              order — we verify accounts as we get to know you.
            </span>
          )}
        </div>

        <AccountForm
          shop={{ lat: delivery.shop_lat, lng: delivery.shop_lng }}
          initial={{
            fullName: p?.full_name ?? "",
            phone: p?.phone ?? "",
            address: p?.address ?? "",
            lat: p?.address_lat ?? null,
            lng: p?.address_lng ?? null,
          }}
        />

        <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/orders" className="text-brand-600 hover:underline">
            My orders →
          </Link>
          <Link href="/menu" className="text-brand-600 hover:underline">
            Browse the menu →
          </Link>
        </div>

        {/* The header drops sign-out on a phone, where it wrapped onto two
            lines and pushed the row into the logo. It belongs here anyway:
            this is where the account chip beside it already leads. */}
        <div className="mt-10 border-t border-ink-950/10 pt-6">
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
