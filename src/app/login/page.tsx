"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <>
      <PageHeader
        eyebrow="Welcome back"
        title="Sign in"
        subtitle="We'll email you a one-time link — no password needed."
      />

      <section className="mx-auto max-w-md px-6 py-14">
        {sent ? (
          <div className="rounded-3xl bg-jade-700 p-8 text-center text-cream-50">
            <p className="font-display text-2xl font-bold">Check your email 📬</p>
            <p className="mt-2 text-cream-100/80">
              We sent a sign-in link to <strong>{email}</strong>. Open it on
              this same device and browser.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-ink-800">
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="rounded-2xl border-2 border-ink-950/15 bg-cream-100 px-5 py-3 font-normal text-ink-950 outline-none transition-colors placeholder:text-ink-800/40 focus:border-brand-600"
              />
            </label>

            {error && (
              <p className="rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-brand-600 px-7 py-4 font-bold text-cream-50 transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
            >
              {submitting ? "Sending…" : "Send magic link →"}
            </button>
          </form>
        )}
      </section>
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="flex-1">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
