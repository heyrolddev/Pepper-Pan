"use client";

import { useState, useTransition } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { voidOrder } from "@/app/admin/orders/void-actions";
import { VOID_REASONS } from "@/lib/order-void";
import { REASON_LIMIT } from "@/lib/cancellation";
import { peso } from "@/lib/peso";

/**
 * "This ticket should never have existed."
 *
 * ── Why it is not another entry in the status dropdown ───────────────────
 *
 * The dropdown is a journey: pending, confirmed, preparing, ready, gone. Each
 * step is a thing that happened to a real order. A void is not a further step
 * along that road — it is the claim that the road was never travelled, and
 * putting it in the same control would offer it as the natural next thing to
 * do to a ticket somebody is actually cooking.
 *
 * ── Why it sits quietly ──────────────────────────────────────────────────
 *
 * Voiding takes money out of the day's takings on one tap. It has to be
 * findable without being reachable by accident during a rush, so: its own
 * button, in the card's footer rather than beside the controls used every
 * service, in ink rather than red — and then a dialog that states the
 * consequence in pesos before anything is written.
 */
export function VoidOrderButton({
  orderId,
  total,
  voided,
}: {
  orderId: string;
  /** What comes out of the day if this goes through. */
  total: number;
  /** Already struck out — the button becomes a statement, not an action. */
  voided: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (voided) return null;

  function submit() {
    setError(null);
    const why = detail.trim() ? `${reason} — ${detail.trim()}` : reason;
    startTransition(async () => {
      try {
        const res = await voidOrder(orderId, why);
        if (res.error) {
          setError(res.error);
          return;
        }
        setOpen(false);
        // No router.refresh(): `voidOrder` revalidates /admin/orders and
        // /admin, and this button is only ever rendered on those. Asking for
        // the page a second time would render the whole of HQ twice.
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not void this ticket.");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => {
          setReason("");
          setDetail("");
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-ink-800/55 ring-1 ring-ink-950/10 transition-colors hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-600/30"
      >
        <span aria-hidden>⊘</span> Void this ticket
      </button>

      {open && (
        <AdminDialog
          title="Void this ticket?"
          subtitle="For an entry that was wrong — not an order somebody called off."
          busy={pending}
          onClose={() => setOpen(false)}
        >
          {/* The distinction, said once, where the decision is made. Put it
              anywhere else and it is documentation nobody reads; put it here
              and it is the difference between two buttons. */}
          <div className="rounded-2xl bg-gold-400/15 px-4 py-3 text-sm leading-relaxed text-ink-800/85 ring-1 ring-gold-500/30">
            <strong className="text-ink-950">Cancelled</strong> means a real
            order fell through, and it counts against the kitchen.{" "}
            <strong className="text-ink-950">Voided</strong> means the till was
            wrong and there was never an order at all — so it counts against
            nobody.
          </div>

          {/* A list rather than a blank box. A required free-text field
              produces "asdf" by the third rush, and a reason nobody can
              group is a reason nobody can count later. */}
          <div className="mt-5 flex flex-col gap-1.5">
            {VOID_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                aria-pressed={reason === r}
                className={`rounded-xl px-4 py-2.5 text-left text-sm font-bold transition-colors ${
                  reason === r
                    ? "bg-ink-950 text-cream-50"
                    : "bg-ink-950/[0.05] text-ink-950 hover:bg-ink-950/10"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={REASON_LIMIT}
            placeholder="Anything to add (optional)"
            className="mt-3 w-full rounded-xl bg-cream-100 px-3 py-2.5 text-sm ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />

          {/* What actually happens, in pesos, before it happens. */}
          <ul className="mt-4 flex flex-col gap-1.5 text-sm text-ink-800/75">
            <li className="flex gap-2">
              <span aria-hidden className="text-brand-700">−</span>
              <span>
                <strong className="font-bold tabular-nums text-ink-950">
                  {peso(total)}
                </strong>{" "}
                comes out of today&apos;s takings.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-jade-700">↩</span>
              <span>Any ingredients already deducted go back on the shelf.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-ink-800/40">•</span>
              <span>
                The ticket stays on the board, struck out, with your name and
                this reason on it. Nothing is deleted and the customer is not
                messaged.
              </span>
            </li>
          </ul>

          {error && (
            <p className="mt-4 rounded-xl bg-brand-600/10 px-4 py-3 text-sm font-bold text-brand-700 ring-1 ring-brand-600/25">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={() => setOpen(false)}
              disabled={pending}
              className="rounded-full px-5 py-3 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950 disabled:opacity-50"
            >
              Keep the ticket
            </button>
            <button
              onClick={submit}
              disabled={!reason || pending}
              className="rounded-full bg-brand-600 px-6 py-3 text-sm font-black text-cream-50 transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            >
              {pending ? "Voiding…" : "Void it"}
            </button>
          </div>
        </AdminDialog>
      )}
    </>
  );
}
