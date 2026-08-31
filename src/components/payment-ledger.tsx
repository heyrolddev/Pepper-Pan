"use client";

import { useMemo, useState } from "react";
import { AdminSearch } from "@/components/admin-search";
import { PaymentVerifier } from "@/components/payment-verifier";
import { formatDateTimeFull } from "@/lib/format-date";
import { STATUS_LABELS, STATUS_TONES, type OrderStatus } from "@/lib/orders";
import {
  METHOD_LABEL,
  moneyLine,
  moneyState,
  type PaymentMethod,
  type PaymentPlan,
  type PaymentStatus,
} from "@/lib/payments";

/**
 * Who owes what, as its own list.
 *
 * The Payments tab carried a badge — GCash receipts waiting to be checked —
 * and then showed only the settings for how customers may pay. The number
 * pointed at nothing. This is the thing it was counting.
 *
 * Ordered by how much the shop stands to lose rather than by date: money
 * somebody claims to have sent and nobody has checked first, then balances
 * still owed, then everything settled. A ledger sorted newest-first buries
 * the one unpaid order from Tuesday under fifty paid ones from today.
 */

export type LedgerRow = {
  id: string;
  created_at: string;
  status: OrderStatus;
  contact_name: string | null;
  contact_phone: string | null;
  revenue: number;
  delivery_fee: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_plan: PaymentPlan;
  payment_reference: string | null;
  payment_receipt_url: string | null;
  downpayment_amount: number;
  downpayment_confirmed_at: string | null;
};

type Bucket = "attention" | "owed" | "settled" | "all";

const BUCKETS: { key: Bucket; label: string; hint: string }[] = [
  {
    key: "attention",
    label: "Needs checking",
    hint: "They say they sent it. Compare the reference against your GCash history, then record what you found.",
  },
  {
    key: "owed",
    label: "Still owed",
    hint: "Money the shop hasn't been paid — nothing received, or a down payment with a balance outstanding.",
  },
  {
    key: "settled",
    label: "Settled",
    hint: "Paid in full or refunded. Nothing to chase.",
  },
  { key: "all", label: "Everything", hint: "Every order, however it was paid." },
];

const peso = (n: number) =>
  "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function bucketOf(row: LedgerRow): Exclude<Bucket, "all"> {
  const m = moneyState(row);
  if (m.awaitingCheck) return "attention";
  return m.balance > 0 ? "owed" : "settled";
}

function Row({ row }: { row: LedgerRow }) {
  const m = moneyState(row);

  return (
    <li className="rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${
                STATUS_TONES[row.status].chip
              }`}
            >
              {STATUS_LABELS[row.status]}
            </span>
            <span className="font-display text-lg font-bold text-ink-950">
              {row.contact_name || "Walk-in"}
            </span>
            {/* An order that's finished and still owes money is the worst
                case on this page: nobody is coming back for it. */}
            {row.status === "completed" && m.balance > 0 && (
              <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-cream-50">
                ⚠ Completed unpaid
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-800/60">
            {row.contact_phone && <>{row.contact_phone} · </>}
            {METHOD_LABEL[row.payment_method]} · #{row.id.slice(0, 8)} ·{" "}
            {formatDateTimeFull(row.created_at)}
          </p>
        </div>

        <span className="text-right">
          <span className="block font-display text-xl font-black text-brand-600">
            {peso(m.total)}
          </span>
          <span
            className={`block text-[11px] font-bold ${
              m.settled
                ? "text-jade-700"
                : m.partPaid
                  ? "text-chili-700"
                  : m.awaitingCheck
                    ? "text-gold-700"
                    : "text-ink-800/55"
            }`}
          >
            {moneyLine(m)}
          </span>
        </span>
      </div>

      <PaymentVerifier
        orderId={row.id}
        method={row.payment_method}
        status={row.payment_status}
        plan={row.payment_plan}
        reference={row.payment_reference}
        receiptUrl={row.payment_receipt_url}
        total={m.total}
        downpayment={Number(row.downpayment_amount)}
        downpaymentConfirmedAt={row.downpayment_confirmed_at}
      />
    </li>
  );
}

export function PaymentLedger({ rows }: { rows: LedgerRow[] }) {
  const [bucket, setBucket] = useState<Bucket>("attention");

  const searchText = useMemo(
    () => (r: LedgerRow) =>
      [
        r.contact_name,
        r.contact_phone,
        r.payment_reference,
        r.payment_method,
        r.payment_status,
        r.status,
        r.id.slice(0, 8),
      ]
        .filter(Boolean)
        .join(" "),
    []
  );

  const hint = BUCKETS.find((b) => b.key === bucket)!.hint;

  return (
    <AdminSearch
      rows={rows}
      searchText={searchText}
      noun="order"
      placeholder="Search name, number, GCash reference…"
    >
      {(filtered, query) => {
        const counts = { attention: 0, owed: 0, settled: 0, all: filtered.length };
        for (const r of filtered) counts[bucketOf(r)] += 1;

        const shown =
          bucket === "all" ? filtered : filtered.filter((r) => bucketOf(r) === bucket);

        // Biggest risk first within the list too, not just across the tabs.
        const owedFirst = [...shown].sort((a, b) => {
          const d = moneyState(b).balance - moneyState(a).balance;
          return d !== 0 ? d : b.created_at.localeCompare(a.created_at);
        });

        return (
          <div className="flex flex-col gap-4">
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
              <div role="tablist" className="flex w-max min-w-full gap-1.5 sm:w-full sm:flex-wrap">
                {BUCKETS.map((b) => {
                  const active = bucket === b.key;
                  const n = counts[b.key];
                  return (
                    <button
                      key={b.key}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setBucket(b.key)}
                      className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                        active
                          ? "bg-ink-950 text-gold-400 ring-2 ring-ink-950/20"
                          : n === 0
                            ? "text-ink-800/40 hover:bg-ink-950/5"
                            : "text-ink-800 hover:bg-ink-950/5"
                      }`}
                    >
                      <span className="whitespace-nowrap">{b.label}</span>
                      <span
                        className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-black tabular-nums ${
                          active
                            ? "bg-cream-50/15"
                            : n === 0
                              ? "text-ink-800/35"
                              : "bg-ink-950/8 text-ink-950"
                        }`}
                      >
                        {n > 999 ? "999+" : n}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-sm text-ink-800/60">{hint}</p>

            {owedFirst.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
                {query.trim()
                  ? `Nothing here matches “${query.trim()}”.`
                  : bucket === "attention"
                    ? "No receipts waiting. Nothing to check. \u{1F389}"
                    : bucket === "owed"
                      ? "Nobody owes the shop anything right now."
                      : "Nothing here yet."}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {owedFirst.map((r) => (
                  <Row key={r.id} row={r} />
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </AdminSearch>
  );
}
