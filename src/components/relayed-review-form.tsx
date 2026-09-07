"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StarPicker } from "@/components/stars";
import { addRelayedReview } from "@/app/reviews/actions";

export type MealChoice = { id: string; name: string };

const field =
  "rounded-xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2.5 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600";
const label = "flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-800/70";

/**
 * Type in a review a customer sent on Messenger.
 *
 * Folded shut until asked for. Reviews come in by chat now and then, not
 * daily, and a permanently open form at the top of the reviews page would
 * read as an invitation to fill it — which is the last thing this particular
 * form should read as.
 *
 * The date field exists because a Messenger review is almost never today's.
 * Without it every relayed review would stamp itself as having arrived the
 * moment it was typed, and the shop's review timeline would say the busiest
 * week for reviews was whichever evening the owner sat down to catch up.
 */
export function RelayedReviewForm({ meals }: { meals: MealChoice[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [mealId, setMealId] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function reset() {
    setAuthorName("");
    setMealId("");
    setRating(0);
    setComment("");
    setReceivedOn("");
    setError(null);
  }

  async function submit() {
    if (!authorName.trim()) return setError("Whose review is it?");
    if (rating < 1) return setError("Pick how many stars they gave.");
    setBusy(true);
    setError(null);
    try {
      const res = await addRelayedReview({
        authorName,
        mealId: mealId || null,
        rating,
        comment,
        receivedOn,
      });
      if (res.error) return setError(res.error);
      reset();
      setOpen(false);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that review.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600"
        >
          ＋ Add a review from Messenger
        </button>
        {saved && (
          <span className="text-sm font-bold text-jade-700">Added ✓</span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
      <h3 className="font-display text-lg font-black text-ink-950">
        A review someone sent you in chat
      </h3>
      <p className="mt-1 text-xs text-ink-800/60">
        Type it in as they wrote it. It will appear on the reviews page marked{" "}
        <span className="font-bold">Sent on Messenger</span>, so customers can
        see it came in by chat rather than being posted here — which is what
        makes the rest of the page believable.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Their name
          <input
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            maxLength={60}
            placeholder="Maria"
            className={field}
          />
        </label>

        <label className={label}>
          What they were rating
          <select
            value={mealId}
            onChange={(e) => setMealId(e.target.value)}
            className={field}
          >
            <option value="">The shop overall</option>
            {meals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <div className={label}>
          Stars they gave
          <div className="pt-1">
            <StarPicker value={rating} onChange={setRating} disabled={busy} />
          </div>
        </div>

        <label className={label}>
          The day they sent it
          <input
            type="date"
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
            className={field}
          />
          <span className="text-[10px] font-medium normal-case tracking-normal text-ink-800/45">
            Leave blank for today.
          </span>
        </label>
      </div>

      <label className={`${label} mt-4`}>
        What they said
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Paste or retype their message — their words, not a summary."
          className={field}
        />
      </label>

      {error && (
        <p className="mt-3 rounded-xl bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-cream-50 disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add this review"}
        </button>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-full px-5 py-2 text-sm font-bold text-ink-800 hover:text-brand-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
