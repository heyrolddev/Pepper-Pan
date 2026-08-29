"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { fieldClass, labelClass, submitClass, errorClass } from "@/lib/form-styles";

function ForgotForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
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
        eyebrow="Account help"
        title="Set a new password"
        subtitle="We'll email you a link to choose a new password."
      />

      <section className="mx-auto max-w-md px-6 py-14">
        {sent ? (
          <div className="rounded-3xl bg-jade-700 p-8 text-center text-cream-50">
            <p className="font-display text-2xl font-bold">Check your inbox 📬</p>
            <p className="mt-2 text-cream-100/80">
              If <strong>{email}</strong> has an account, a reset link is on its
              way. Open it on this same device.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className={labelClass}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={fieldClass}
              />
            </div>

            {error && <p className={errorClass}>{error}</p>}

            <button type="submit" disabled={submitting} className={submitClass}>
              {submitting ? "Sending…" : "Send reset link →"}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-ink-800/70">
          <Link href="/login" className="font-bold text-brand-600 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </section>
    </>
  );
}

export default function ForgotPasswordPage() {
  return (
    <main className="flex-1">
      <Suspense>
        <ForgotForm />
      </Suspense>
    </main>
  );
}
