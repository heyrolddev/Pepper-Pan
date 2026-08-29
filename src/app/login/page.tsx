"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { PasswordField } from "@/components/password-field";
import { fieldClass, labelClass, submitClass, errorClass } from "@/lib/form-styles";

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [showResetHint, setShowResetHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setShowResetHint(false);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        // Supabase deliberately can't tell us apart "wrong password" from
        // "this account has no password yet" (e.g. it was created by an old
        // magic link), so offer the reset path either way.
        setError("That email and password didn't work.");
        setShowResetHint(true);
      } else if (/email not confirmed/i.test(error.message)) {
        setError("Please confirm your email first — check your inbox for the link.");
      } else {
        setError(error.message);
      }
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

          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="Your password"
          />

          {error && <p className={errorClass}>{error}</p>}

          {showResetHint && (
            <div className="rounded-2xl bg-gold-400 px-5 py-4 text-sm text-ink-950">
              <p className="font-bold">Never set a password?</p>
              <p className="mt-1">
                If your account was made with an emailed sign-in link, it has
                no password yet.{" "}
                <Link
                  href={`/forgot-password?email=${encodeURIComponent(email)}`}
                  className="font-bold underline"
                >
                  Set one now
                </Link>
                .
              </p>
            </div>
          )}

          <button type="submit" disabled={submitting} className={submitClass}>
            {submitting ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <div className="mt-8 flex flex-col gap-2 text-center text-sm text-ink-800/70">
          <Link
            href={`/forgot-password?email=${encodeURIComponent(email)}`}
            className="font-bold text-brand-600 hover:underline"
          >
            Forgot your password?
          </Link>
          <p>
            New here?{" "}
            <Link
              href={`/signup?next=${encodeURIComponent(next)}`}
              className="font-bold text-brand-600 hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
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
