"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptRoleOffer, declineRoleOffer } from "@/app/account/actions";
import { ROLE_BLURBS, ROLE_LABELS, type Role } from "@/lib/permissions";

/**
 * "You've been offered a job. Do you want it?"
 *
 * Shown on the person's own account page, because that is the one screen
 * they can reach and the owner cannot — which is the whole point of making
 * an offer rather than applying a role. Accepting from their own signed-in
 * session is what turns "the owner says they work here" into "they said so
 * themselves", and it is proof the account is actually theirs.
 *
 * The blurb is the same text HQ shows the owner when picking the role, so
 * both sides of the conversation are reading the same description of what
 * the job can do.
 */
export function RoleOffer({ role }: { role: Role }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setBusy(accept ? "accept" : "decline");
    setError(null);
    const r = accept ? await acceptRoleOffer() : await declineRoleOffer();
    setBusy(null);
    if (r.error) setError(r.error);
    else router.refresh();
  }

  return (
    <section className="rounded-3xl bg-ink-950 p-6 text-cream-50 ring-2 ring-gold-400 sm:p-8">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold-400">
        <span className="h-px w-6 bg-gold-400/60" />
        An offer from Pepper Pan
      </p>
      <h2 className="mt-4 font-display text-2xl font-black tracking-tight sm:text-3xl">
        You&apos;ve been offered the {ROLE_LABELS[role].toLowerCase()} role
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream-100/80">
        {ROLE_BLURBS[role]}
      </p>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream-100/60">
        Nothing changes until you accept. Once you do, this account can open
        HQ — on one device, and the owner allows any others.
      </p>

      {error && (
        <p className="mt-4 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => decide(true)}
          disabled={busy !== null}
          className="rounded-full bg-gold-400 px-5 py-2.5 text-sm font-black text-ink-950 transition-colors hover:bg-gold-300 disabled:opacity-60"
        >
          {busy === "accept" ? "Accepting…" : "Accept the role"}
        </button>
        <button
          onClick={() => decide(false)}
          disabled={busy !== null}
          className="rounded-full px-5 py-2.5 text-sm font-bold text-cream-100/70 transition-colors hover:text-cream-50 disabled:opacity-60"
        >
          {busy === "decline" ? "Declining…" : "No thanks"}
        </button>
      </div>
    </section>
  );
}
