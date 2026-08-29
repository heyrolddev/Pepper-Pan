"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { PasswordField } from "@/components/password-field";
import { submitClass, errorClass } from "@/lib/form-styles";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The reset link goes through /auth/callback, which exchanges the code for
  // a session — so by the time we land here the user should be signed in.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setReady(!!data.user));
  }, []);

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

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <main className="flex-1">
        <PageHeader eyebrow="All set" title="Password updated" />
        <section className="mx-auto max-w-md px-6 py-14 text-center">
          <div className="rounded-3xl bg-jade-700 p-8 text-cream-50">
            <p className="font-display text-2xl font-bold">You&apos;re signed in ✓</p>
            <p className="mt-2 text-cream-100/80">
              Your new password is saved — you can use it next time.
            </p>
          </div>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-brand-600 px-8 py-4 font-bold text-cream-50 transition-transform hover:scale-105"
          >
            Go to the site →
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <PageHeader
        eyebrow="Account help"
        title="Choose a new password"
        subtitle="Pick something you'll remember — at least 8 characters."
      />

      <section className="mx-auto max-w-md px-6 py-14">
        {ready === false && (
          <div className="mb-6 rounded-2xl bg-gold-400 px-5 py-4 text-sm text-ink-950">
            <p className="font-bold">This reset link isn&apos;t active.</p>
            <p className="mt-1">
              It may have expired or already been used.{" "}
              <Link href="/forgot-password" className="font-bold underline">
                Send a new one
              </Link>
              .
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <PasswordField
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
            placeholder="At least 8 characters"
          />
          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Type it once more"
          />

          {mismatch && (
            <p className={errorClass}>The two passwords don&apos;t match yet.</p>
          )}
          {error && <p className={errorClass}>{error}</p>}

          <button
            type="submit"
            disabled={submitting || mismatch || ready === false}
            className={submitClass}
          >
            {submitting ? "Saving…" : "Save new password →"}
          </button>
        </form>
      </section>
    </main>
  );
}
