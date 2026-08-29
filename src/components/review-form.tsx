"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StarPicker, Stars } from "@/components/stars";
import { saveReview } from "@/app/reviews/actions";

export type ExistingReview = {
  rating: number;
  comment: string | null;
} | null;

/**
 * One row of the "rate what you ordered" list: the shop itself, or a dish.
 * Collapsed until tapped, so an order with six items isn't six open forms.
 */
export function ReviewForm({
  mealId,
  label,
  sublabel,
  existing,
}: {
  mealId: string | null;
  label: string;
  sublabel?: string;
  existing: ExistingReview;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (rating < 1) return setError("Please pick a star rating first.");
    setBusy(true);
    setError(null);
    try {
      const res = await saveReview({ mealId, rating, comment });
      if (res.error) return setError(res.error);
      setSaved(true);
      setOpen(false);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink-950">{label}</p>
          {sublabel && <p className="text-xs text-ink-800/55">{sublabel}</p>}
        </div>

        {!open &&
          (existing ? (
            <span className="flex items-center gap-2">
              <Stars rating={existing.rating} />
              <button
                onClick={() => setOpen(true)}
                className="text-xs font-bold text-brand-600 hover:underline"
              >
                Edit
              </button>
            </span>
          ) : (
            <button
              onClick={() => setOpen(true)}
              className="rounded-full bg-ink-950 px-4 py-2 text-xs font-bold text-cream-50 transition-colors hover:bg-brand-600"
            >
              {saved ? "Saved ✓" : "Rate this"}
            </button>
          ))}
      </div>

      {existing?.comment && !open && (
        <p className="mt-2 text-sm text-ink-800/75">&ldquo;{existing.comment}&rdquo;</p>
      )}

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <StarPicker value={rating} onChange={setRating} disabled={busy} />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="How was it? (optional)"
            className="rounded-xl border-2 border-ink-950/15 bg-cream-100 px-4 py-2 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600"
          />
          {error && (
            <p className="rounded-xl bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-cream-50 disabled:opacity-60"
            >
              {busy ? "Saving…" : existing ? "Update review" : "Post review"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setError(null);
                setRating(existing?.rating ?? 0);
                setComment(existing?.comment ?? "");
              }}
              className="rounded-full px-5 py-2 text-sm font-bold text-ink-800 hover:text-brand-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
