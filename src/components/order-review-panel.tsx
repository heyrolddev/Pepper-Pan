"use client";

import { useState } from "react";
import { ReviewForm, type ExistingReview } from "@/components/review-form";

export type ReviewableItem = {
  mealId: string | null;
  label: string;
  sublabel?: string;
  existing: ExistingReview;
};

/**
 * Shown under a completed order: rate the shop and each dish that was in it.
 * Collapsed behind one button, because most people won't review every order
 * and an always-open block would bury the order details.
 */
export function OrderReviewPanel({ items }: { items: ReviewableItem[] }) {
  const reviewed = items.filter((i) => i.existing).length;
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-ink-950/10 px-6 py-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="font-bold text-ink-950">
            {reviewed === 0
              ? "⭐ How was it?"
              : reviewed === items.length
                ? "⭐ Thanks for the review!"
                : "⭐ Finish your review"}
          </span>
          <span className="ml-2 text-xs text-ink-800/55">
            {reviewed}/{items.length} rated
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold text-brand-600">
          {open ? "Hide" : reviewed === 0 ? "Rate now" : "Open"}
        </span>
      </button>

      {open && (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((item) => (
            <ReviewForm
              key={item.mealId ?? "shop"}
              mealId={item.mealId}
              label={item.label}
              sublabel={item.sublabel}
              existing={item.existing}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
