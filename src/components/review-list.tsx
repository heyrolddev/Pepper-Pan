import { Avatar } from "@/components/avatar";
import { Stars } from "@/components/stars";
import { formatDate } from "@/lib/format-date";

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author: string;
  /** Their profile picture, if they've added one. */
  avatarUrl: string | null;
  mealName: string | null;
  shopReply: string | null;
  /**
   * Sent to the shop on Messenger and typed in by the owner, rather than
   * posted here by the customer.
   *
   * Carried all the way to the card on purpose. Both kinds are real reviews
   * from real customers and both count towards the rating — but one of them
   * was typed by the shop, and a page that doesn't say so is a page making a
   * claim it can't back. The badge costs nothing and is the difference
   * between "trust us" and "here's exactly what this is".
   */
  relayed: boolean;
};

/** The small print that says where a relayed review came from. */
export function RelayedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="This customer sent their review to us in a Messenger chat, and we added it here."
      className={`rounded-full bg-ink-950/[0.07] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-800/60 ${className}`}
    >
      Sent on Messenger
    </span>
  );
}

export function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={r.author} url={r.avatarUrl} size={44} />
              <div>
                <p className="flex flex-wrap items-center gap-2 font-bold text-ink-950">
                  {r.author}
                  {r.relayed && <RelayedBadge />}
                </p>
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
