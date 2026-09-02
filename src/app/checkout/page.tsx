import Link from "next/link";
import { getViewer, isConfigured } from "@/lib/auth";
import { CheckoutForm } from "@/components/checkout-form";
import { PageHeader } from "@/components/page-header";
import { getDeliverySettings } from "@/lib/delivery-server";
import { getPaymentSettings } from "@/lib/payments-server";
import { getSchedule } from "@/lib/hours-server";

import { privatePage } from "@/lib/seo";

export const metadata = privatePage("Checkout");

export default async function CheckoutPage() {
  if (!isConfigured()) {
    return (
      <main className="flex-1">
        <PageHeader title="Checkout" />
        <section className="mx-auto max-w-md px-6 py-14">
          <p className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-8 text-center text-ink-800/80">
            Ordering isn&apos;t set up yet.
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
          eyebrow="One quick step"
          title="Sign in to check out"
          subtitle="Sign in — or create an account in a few seconds — to place your order."
        />
        <section className="mx-auto flex max-w-md flex-wrap justify-center gap-4 px-6 py-14">
          <Link
            href="/login?next=/checkout"
            className="rounded-full bg-brand-600 px-8 py-4 font-bold text-cream-50 transition-transform hover:scale-105"
          >
            Sign in →
          </Link>
          <Link
            href="/signup?next=/checkout"
            className="rounded-full border-2 border-ink-950 px-8 py-4 font-bold text-ink-950 transition-colors hover:bg-ink-950 hover:text-cream-50"
          >
            Create account
          </Link>
        </section>
      </main>
    );
  }

  if (viewer.profile?.is_blocked) {
    return (
      <main className="flex-1">
        <PageHeader eyebrow="Account on hold" title="Ordering paused" />
        <section className="mx-auto max-w-md px-6 py-14">
          <p className="rounded-3xl bg-brand-600 p-8 text-center font-semibold text-cream-50">
            Ordering is paused on this account. Please contact us at
            +63 947 353 3060 if you think this is a mistake.
          </p>
        </section>
      </main>
    );
  }

  const [delivery, payments, schedule] = await Promise.all([
    getDeliverySettings(),
    getPaymentSettings(),
    getSchedule(),
  ]);

  return (
    <main className="flex-1">
      <PageHeader
        eyebrow="Last step"
        title="Checkout"
        subtitle="Tell us where this is going and we'll start cooking."
      />
      <section className="mx-auto max-w-md px-6 py-14">
        <CheckoutForm
          delivery={delivery}
          payments={payments}
          schedule={{
            hours: schedule.hours,
            closures: schedule.closures,
            settings: schedule.settings,
            state: schedule.state,
            configured: schedule.configured,
          }}
          defaults={{
            name: viewer.profile?.full_name ?? "",
            phone: viewer.profile?.phone ?? "",
            address: viewer.profile?.address ?? "",
            lat: viewer.profile?.address_lat ?? null,
            lng: viewer.profile?.address_lng ?? null,
          }}
        />
      </section>
    </main>
  );
}
