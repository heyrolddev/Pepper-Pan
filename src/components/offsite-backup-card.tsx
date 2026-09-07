"use client";

import { useState, useTransition } from "react";
import { saveOffsiteBackup, sendOffsiteNow } from "@/app/admin/backup/actions";
import type { OffsiteSettings } from "@/lib/offsite-backup";
import { formatDateTimeFull } from "@/lib/format-date";

/**
 * The weekly copy that leaves the building.
 *
 * Its own card rather than a line in the download hero, because it answers a
 * different question. The hero asks "have you taken a copy lately?" — a
 * question about the owner. This asks "is one leaving on its own?", which is
 * the question that matters on the day the owner is in hospital and nobody
 * has pressed anything for a fortnight.
 *
 * The "send one now" button is not a convenience. A weekly job that has never
 * run once is a promise, and the point of pressing it here is to find out it
 * works before the week it is needed.
 */
export function OffsiteBackupCard({ settings }: { settings: OffsiteSettings }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [email, setEmail] = useState(settings.email ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(settings.lastError);
  const [busy, start] = useTransition();

  const dirty = enabled !== settings.enabled || email.trim() !== (settings.email ?? "");

  function save() {
    setError(null);
    setSaved(null);
    start(async () => {
      const r = await saveOffsiteBackup({ enabled, email });
      if (r.error) setError(r.error);
      else setSaved(enabled ? "On. The first one goes out within the week." : "Off.");
    });
  }

  function sendNow() {
    setError(null);
    setSaved(null);
    start(async () => {
      const r = await sendOffsiteNow();
      if (r.sent) setSaved(`Sent to ${email.trim()}. Check it arrived.`);
      else setError(r.error ?? "It didn't go.");
    });
  }

  return (
    <section className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10 sm:p-8">
      <h3 className="font-display text-xl font-black tracking-tight text-ink-950">
        A copy out of the building, every week
      </h3>
      <p className="mt-2 max-w-2xl text-sm text-ink-800/70">
        The daily copies live in this database, so they cannot survive losing
        it. This posts the whole thing to an address you choose, once a week,
        without anybody pressing anything.
      </p>

      {!settings.configured ? (
        <p className="mt-5 rounded-2xl border-2 border-dashed border-ink-950/15 bg-cream-50 p-5 text-sm text-ink-800/65">
          Email isn&apos;t set up on this site yet, so there is nothing to send
          with. It needs <code className="rounded bg-cream-200 px-1">RESEND_API_KEY</code>{" "}
          and <code className="rounded bg-cream-200 px-1">SHOP_FROM_EMAIL</code> —
          the same pair that sends customers their order updates.
        </p>
      ) : (
        <>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-cream-50 px-4 py-3.5 ring-1 ring-ink-950/10">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-jade-600"
            />
            <span className="text-sm text-ink-800/75">
              <strong className="text-ink-950">Email me a copy every week</strong>
              <br />
              The file is every customer&apos;s name, phone and address. Send it
              somewhere only you can read.
            </span>
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="where it should go"
              className="min-w-0 flex-1 rounded-xl bg-cream-50 px-3 py-2.5 text-sm ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400 sm:max-w-sm"
            />
            <button
              onClick={save}
              disabled={busy || !dirty}
              className="rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-brand-600 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {settings.enabled && (
              <button
                onClick={sendNow}
                disabled={busy}
                className="rounded-xl bg-cream-50 px-4 py-2.5 text-sm font-bold text-ink-950 ring-1 ring-ink-950/15 transition-colors hover:bg-cream-200 disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send one now"}
              </button>
            )}
          </div>

          <p className="mt-3 text-xs text-ink-800/55">
            {settings.lastAt
              ? `Last one went out ${formatDateTimeFull(settings.lastAt)}.`
              : settings.enabled
                ? "None sent yet. Press “Send one now” to check it works before you need it to."
                : "None sent yet."}
          </p>

          {saved && (
            <p className="mt-3 rounded-2xl bg-jade-600/15 px-4 py-3 text-sm font-semibold text-jade-700">
              {saved}
            </p>
          )}
          {/* A weekly job that stopped working eleven weeks ago and never said
              so is worse than one nobody set up, because the owner has been
              counting on it. */}
          {error && (
            <p className="mt-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
