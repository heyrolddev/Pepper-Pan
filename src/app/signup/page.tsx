"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { PasswordField } from "@/components/password-field";
import { fieldClass, labelClass, submitClass, errorClass } from "@/lib/form-styles";

function SignupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get("next") ?? "/";

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Please use a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setAlreadyRegistered(false);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim(), phone: phone.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setSubmitting(false);

    if (error) {
      if (/already registered|already exists/i.test(error.message)) {
        setAlreadyRegistered(true);
        return;
      }
      setError(error.message);
      return;
    }

    // With email-enumeration protection on, Supabase returns a *success* for
    // an existing address but with no identities attached — the only way to
    // tell that the address is already taken.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setAlreadyRegistered(true);
      return;
    }

    if (!data.session) {
      setNeedsConfirmation(true);
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
          <div className={labelClass}>
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan dela Cruz"
              className={fieldClass}
            />
          </div>

          <div className={labelClass}>
            <label htmlFor="phone">Mobile number</label>
            <input
              id="phone"
              required
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09XX XXX XXXX"
              className={fieldClass}
            />
          </div>

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
            autoComplete="new-password"
            minLength={8}
            placeholder="At least 8 characters"
          />

          <PasswordField
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Type it once more"
            hint={mismatch ? undefined : "Make sure both boxes match exactly."}
          />

          {mismatch && (
            <p className={errorClass}>The two passwords don&apos;t match yet.</p>
          )}

          {alreadyRegistered && (
            <div className="rounded-2xl bg-gold-400 px-5 py-4 text-sm text-ink-950">
              <p className="font-bold">That email already has an account.</p>
              <p className="mt-1">
                Try{" "}
                <Link
                  href={`/login?next=${encodeURIComponent(next)}`}
                  className="font-bold underline"
                >
                  signing in
                </Link>
                . If your password doesn&apos;t work — or you never set one —{" "}
                <Link
                  href={`/forgot-password?email=${encodeURIComponent(email)}`}
                  className="font-bold underline"
                >
                  set a new password
                </Link>
                .
              </p>
            </div>
          )}

          {error && <p className={errorClass}>{error}</p>}

          <button
            type="submit"
            disabled={submitting || mismatch}
            className={submitClass}
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
