"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminSearch } from "@/components/admin-search";
import { Avatar } from "@/components/avatar";
import { Stars } from "@/components/stars";
import {
  deleteRelayedReview,
  replyToReview,
  setReviewHidden,
} from "@/app/reviews/actions";
import { formatDateTimeFull } from "@/lib/format-date";

export type AdminReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author: string;
  avatarUrl: string | null;
  mealName: string | null;
  shopReply: string | null;
  isHidden: boolean;
  /** Typed in from a Messenger chat rather than posted by the customer. */
  relayed: boolean;
  /** Who typed it in, for a relayed one. */
  relayedByName: string | null;
};

function ReviewRow({
  review: r,
  canRelay,
}: {
  review: AdminReview;
  canRelay: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState(r.shopReply ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.error) setError(res.error);
        else {
          setReplyOpen(false);
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work.");
      }
    });
  }

  return (
    <li
      className={`rounded-2xl p-5 ring-1 ${
        r.isHidden ? "bg-ink-950/5 ring-ink-950/15" : "bg-cream-100 ring-ink-950/10"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={r.author} url={r.avatarUrl} size={40} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-ink-950">{r.author}</span>
              {r.relayed && (
                <span className="rounded-full bg-gold-400/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-800">
                  From Messenger
                </span>
              )}
              {r.isHidden && (
                <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cream-100">
                  Hidden
                </span>
              )}
            </div>
            <p className="text-xs text-ink-800/55">
              {r.mealName ?? "The shop overall"} ·{" "}
              {formatDateTimeFull(r.created_at)}
              {r.relayed && r.relayedByName && ` · added by ${r.relayedByName}`}
            </p>
          </div>
        </div>
        <Stars rating={r.rating} size="md" />
      </div>

      {r.comment && <p className="mt-3 text-sm text-ink-800">&ldquo;{r.comment}&rdquo;</p>}

      {r.shopReply && !replyOpen && (
        <div className="mt-3 rounded-xl bg-cream-50 px-4 py-2.5 ring-1 ring-ink-950/10">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-600">
            Your reply
          </p>
          <p className="mt-0.5 text-sm text-ink-800">{r.shopReply}</p>
        </div>
      )}

      {replyOpen && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Reply publicly — thank them, or put a complaint right."
            className="rounded-xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2 text-sm outline-none focus:border-brand-600"
          />
          <div className="flex gap-2">
            <button
              onClick={() => run(() => replyToReview(r.id, reply))}
              disabled={pending}
              className="rounded-full bg-brand-600 px-4 py-1.5 text-xs font-bold text-cream-50 disabled:opacity-60"
            >
              {pending ? "…" : "Post reply"}
            </button>
            <button
              onClick={() => {
                setReplyOpen(false);
                setReply(r.shopReply ?? "");
              }}
              className="rounded-full px-4 py-1.5 text-xs font-bold text-ink-800 hover:text-brand-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!replyOpen && (
          <button
            onClick={() => setReplyOpen(true)}
            className="rounded-full bg-ink-950 px-4 py-1.5 text-xs font-bold text-cream-50 transition-colors hover:bg-brand-600"
          >
            {r.shopReply ? "Edit reply" : "Reply"}
          </button>
        )}
        <button
          onClick={() => run(() => setReviewHidden(r.id, !r.isHidden))}
          disabled={pending}
          className="rounded-full bg-ink-950/10 px-4 py-1.5 text-xs font-bold text-ink-800 transition-colors hover:bg-ink-950/20 disabled:opacity-60"
        >
          {r.isHidden ? "Show again" : "Hide"}
        </button>

        {/* Delete only ever appears on a relayed review, and the action
            refuses anything else regardless of what it is sent. A customer's
            own words are theirs; the most the shop may do to those is stop
            showing them. This one is the shop's own typing, so a wrong name
            or the wrong dish is a mistake to erase, not to hide. */}
        {r.relayed && canRelay && (
          confirmDelete ? (
            <span className="flex items-center gap-2">
              <button
                onClick={() => run(() => deleteRelayedReview(r.id))}
                disabled={pending}
                className="rounded-full bg-brand-600 px-4 py-1.5 text-xs font-bold text-cream-50 disabled:opacity-60"
              >
                {pending ? "…" : "Delete for good"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs font-bold text-ink-800 hover:text-brand-600"
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
              className="rounded-full px-4 py-1.5 text-xs font-bold text-brand-600 transition-colors hover:bg-brand-600 hover:text-cream-50 disabled:opacity-60"
            >
              Delete
            </button>
          )
        )}
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-brand-700">{error}</p>}
    </li>
  );
}

export function AdminReviewList({
  reviews,
  canRelay = false,
}: {
  reviews: AdminReview[];
  canRelay?: boolean;
}) {
  const searchText = useCallback(
    (r: AdminReview) =>
      [
        r.author,
        r.comment,
        r.mealName ?? "shop overall",
        r.shopReply,
        `${r.rating} star`,
        r.isHidden ? "hidden" : "visible",
        r.shopReply ? "replied" : "no reply",
        r.relayed ? "messenger relayed" : "posted here",
      ]
        .filter(Boolean)
        .join(" "),
    []
  );

  return (
    <AdminSearch
      rows={reviews}
      searchText={searchText}
      noun="review"
      placeholder="Search reviews by name, dish, rating…"
    >
      {(filtered, query) =>
        filtered.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
            {query.trim()
              ? `No reviews match “${query}”.`
              : "No reviews yet. They'll appear here once customers rate a completed order."}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {filtered.map((r) => (
              <ReviewRow key={r.id} review={r} canRelay={canRelay} />
            ))}
          </ul>
        )
      }
    </AdminSearch>
  );
}
