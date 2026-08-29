"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";

const fieldClass =
  "rounded-2xl border-2 border-ink-950/15 bg-cream-100 px-5 py-3 font-normal text-ink-950 outline-none transition-colors placeholder:text-ink-800/40 focus:border-brand-600";
const labelClass =
  "flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-ink-800";

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "That email and password don't match. Double-check and try again."
          : error.message
      );
      setSubmitting(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <>
      <PageHeader
        eyebrow="Welcome back"
        title="Sign in"
        subtitle="Sign in to order, track your orders and save your details."
      />

      <section className="mx-auto max-w-md px-6 py-14">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className={labelClass}>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={fieldClass}
            />
          </label>

          <label className={labelClass}>
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className={fieldClass}
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
            {submitting ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-ink-800/70">
          New here?{" "}
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="font-bold text-brand-600 hover:underline"
          >
            Create an account
          </Link>
        </p>
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
