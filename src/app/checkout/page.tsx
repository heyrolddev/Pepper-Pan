import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "@/components/checkout-form";
import { PageHeader } from "@/components/page-header";

export default async function CheckoutPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex-1">
        <PageHeader
          eyebrow="One quick step"
          title="Sign in to check out"
          subtitle="We'll email you a one-time link — no password to remember."
        />
        <section className="mx-auto max-w-md px-6 py-14 text-center">
          <Link
            href="/login?next=/checkout"
            className="inline-block rounded-full bg-brand-600 px-8 py-4 font-bold text-cream-50 transition-transform hover:scale-105"
          >
            Sign in →
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <PageHeader
        eyebrow="Last step"
        title="Checkout"
        subtitle="Tell us where this is going and we'll start cooking."
      />
      <section className="mx-auto max-w-md px-6 py-14">
        <CheckoutForm />
      </section>
    </main>
  );
}
