import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "@/components/checkout-form";

export default async function CheckoutPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <p className="text-brand-800/80 dark:text-brand-100/70">
          Ordering isn&apos;t set up yet.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
          Sign in to check out
        </h1>
        <Link
          href="/login?next=/checkout"
          className="inline-block rounded-full bg-brand-900 px-6 py-3 font-medium text-brand-50 transition-colors hover:bg-brand-800 dark:bg-brand-100 dark:text-brand-950 dark:hover:bg-brand-200"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
        Checkout
      </h1>
      <CheckoutForm />
    </main>
  );
}
