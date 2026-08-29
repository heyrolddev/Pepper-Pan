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

function SignupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get("next") ?? "/";

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Please use a password of at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim(), phone: phone.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    // With email confirmation switched on, Supabase returns a user but no
    // session until they click the link.
    if (!data.session) {
      setNeedsConfirmation(true);
      setSubmitting(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  if (needsConfirmation) {
    return (
      <>
        <PageHeader eyebrow="Almost there" title="Confirm your email" />
        <section className="mx-auto max-w-md px-6 py-14">
          <div className="rounded-3xl bg-jade-700 p-8 text-center text-cream-50">
            <p className="font-display text-2xl font-bold">Check your inbox 📬</p>
            <p className="mt-2 text-cream-100/80">
              We sent a confirmation link to <strong>{email}</strong>. Open it
              to finish creating your account.
            </p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Join us"
        title="Create your account"
        subtitle="Your name and number let us confirm your order — and keep fake orders out."
      />

      <section className="mx-auto max-w-md px-6 py-14">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className={labelClass}>
            Full name
            <input
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan dela Cruz"
              className={fieldClass}
            />
          </label>

          <label className={labelClass}>
            Mobile number
            <input
              required
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09XX XXX XXXX"
              className={fieldClass}
            />
          </label>

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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
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
            {submitting ? "Creating account…" : "Create account →"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-ink-800/70">
          Already have an account?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="font-bold text-brand-600 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </section>
    </>
  );
}

export default function SignupPage() {
  return (
    <main className="flex-1">
      <Suspense>
        <SignupForm />
      </Suspense>
    </main>
  );
}
