import { Stars } from "@/components/stars";
import { formatDate } from "@/lib/format-date";

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author: string;
  mealName: string | null;
  shopReply: string | null;
};

/** First name only — a review is public, a full name doesn't need to be. */
export function displayName(fullName: string | null): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  if (!first) return "A customer";
  return first;
}

export function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 font-display text-lg font-black text-cream-50">
                {r.author.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="font-bold text-ink-950">{r.author}</p>
                <p className="text-xs text-ink-800/55">
                  {r.mealName ?? "The shop overall"} ·{" "}
                  {formatDate(r.created_at)}
                </p>
              </div>
            </div>
            <Stars rating={r.rating} size="md" />
          </div>

          {r.comment && (
            <p className="mt-3 text-ink-800">&ldquo;{r.comment}&rdquo;</p>
          )}

          {r.shopReply && (
            <div className="mt-4 rounded-2xl bg-cream-50 px-5 py-3 ring-1 ring-ink-950/10">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
                Pepper Pan replied
              </p>
              <p className="mt-1 text-sm text-ink-800">{r.shopReply}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
