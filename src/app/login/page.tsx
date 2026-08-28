"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-amber-950 dark:text-amber-50">
        Sign in
      </h1>
      <p className="mb-8 text-amber-800/80 dark:text-amber-100/70">
        We&apos;ll email you a link — no password needed.
      </p>

      {sent ? (
        <p className="rounded-lg border border-dashed border-amber-300 bg-white/60 p-6 text-amber-700 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-amber-200">
          Check your email for a sign-in link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded border border-amber-300 bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-amber-900 px-6 py-3 font-medium text-amber-50 transition-colors hover:bg-amber-800 disabled:opacity-60 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
          >
            {submitting ? "Sending…" : "Send magic link"}
          </button>
        </form>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
