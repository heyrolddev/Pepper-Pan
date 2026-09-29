"use client";

import { useEffect, useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { peso, unitPeso } from "@/lib/peso";
import { formatDate } from "@/lib/format-date";
import { supplierPurchases } from "@/app/admin/suppliers/actions";
import {
  cheaperElsewhere,
  supplierItems,
  supplierTotal,
  unitPrice,
  type PurchaseLine,
  type SupplierItem,
} from "@/lib/supplier-prices";

/**
 * What the shop has bought here, and what it paid.
 *
 * The screen used to carry a free-text note saying what a supplier sells.
 * That is a label. The shop asked for a basis — "para may pagbabasihan" —
 * and a basis is a number you can compare, which means the UNIT price: a
 * ₱1,150 delivery and a ₱250 one say nothing until you know one was five
 * kilos and the other one.
 *
 * Two questions get answered, and they are different questions. Is this
 * supplier getting dearer, which needs their own history; and were they
 * ever the right choice, which needs everybody else's. The shop has always
 * had the second answer and has never been shown it side by side.
 */
export function SupplierPricesDialog({
  supplier,
  onClose,
}: {
  supplier: { id: string; name: string };
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    lines: PurchaseLine[];
    others: PurchaseLine[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supplierPurchases(supplier.id).then((r) => {
      if (!alive) return;
      if (r.error) setError(r.error);
      setData({ lines: r.lines, others: r.others });
    });
    return () => {
      alive = false;
    };
  }, [supplier.id]);

  const items = data ? supplierItems(data.lines) : [];
  const total = supplierTotal(items);

  return (
    <AdminDialog
      title={supplier.name}
      subtitle={
        total.items > 0
          ? `${peso(total.spent, 0)} across ${total.items} thing${total.items === 1 ? "" : "s"} — last delivery ${formatDate(total.lastOn!)}.`
          : "What you've bought here, and what you paid."
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
            {error}
          </p>
        )}

        {data === null ? (
          <p className="rounded-2xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-800/60">
            Looking…
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm leading-relaxed text-ink-800/70">
            Nothing recorded from here yet. Every delivery logged through
            Inventory → Restock lands on this list with what it cost, and from
            the second one onwards this will tell you whether the price moved.
          </p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <ItemRow
                key={item.ingredientId}
                item={item}
                elsewhere={cheaperElsewhere(item, data.others)}
                open={open === item.ingredientId}
                onToggle={() =>
                  setOpen(open === item.ingredientId ? null : item.ingredientId)
                }
              />
            ))}
          </ul>
        )}
      </div>
    </AdminDialog>
  );
}

const MOVE: Record<SupplierItem["move"], { label: string; className: string } | null> = {
  up: { label: "▲", className: "bg-brand-600/12 text-brand-700 ring-brand-600/25" },
  down: { label: "▼", className: "bg-jade-600/12 text-jade-800 ring-jade-600/25" },
  same: { label: "=", className: "bg-ink-950/6 text-ink-800/60 ring-ink-950/10" },
  // A first delivery has no direction, and drawing an arrow on it would be
  // inventing information about the shop's own costs.
  first: null,
};

function ItemRow({
  item,
  elsewhere,
  open,
  onToggle,
}: {
  item: SupplierItem;
  elsewhere: ReturnType<typeof cheaperElsewhere>;
  open: boolean;
  onToggle: () => void;
}) {
  const move = MOVE[item.move];

  return (
    <li className="overflow-hidden rounded-2xl bg-cream-100 ring-1 ring-ink-950/8">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-cream-200/60"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-display text-sm font-black text-ink-950">
            {item.name}
          </span>
          <span className="flex items-baseline gap-2">
            {item.lastUnit !== null && (
              <span className="font-display text-sm font-black tabular-nums text-ink-950">
                {unitPeso(item.lastUnit)}
                <span className="ml-0.5 text-[11px] font-bold text-ink-800/50">
                  /{item.unit}
                </span>
              </span>
            )}
            {move && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ring-1 ${move.className}`}
              >
                {move.label}
                {item.change !== null && item.move !== "same" && (
                  <> {Math.abs(Math.round(item.change * 100))}%</>
                )}
              </span>
            )}
          </span>
        </div>

        <p className="mt-0.5 text-xs text-ink-800/55">
          {item.times} deliver{item.times === 1 ? "y" : "ies"} ·{" "}
          {peso(item.spent, 0)} in total · last {formatDate(item.lastOn)}
        </p>

        {/* Their own history says whether they are getting dearer. It cannot
            say whether they were ever the right choice. */}
        {elsewhere && (
          <p className="mt-2 rounded-xl bg-gold-400/25 px-3 py-2 text-xs leading-relaxed text-ink-900">
            <strong className="font-black">{elsewhere.supplierName}</strong>{" "}
            charged {unitPeso(elsewhere.unit)}/{item.unit} on{" "}
            {formatDate(elsewhere.on)} —{" "}
            <strong className="font-black">
              {Math.round(elsewhere.saving * 100)}% less
            </strong>
            .
          </p>
        )}
      </button>

      {open && (
        <ul className="border-t border-ink-950/8 bg-cream-50/70 px-4 py-2.5">
          {item.lines.map((l) => {
            const u = unitPrice(l);
            return (
              <li
                key={l.id}
                className="flex items-baseline justify-between gap-3 py-1 text-xs"
              >
                <span className="tabular-nums text-ink-800/55">
                  {formatDate(l.date)}
                </span>
                <span className="text-ink-800/70">
                  {l.qty.toLocaleString("en-PH")} {item.unit}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-bold tabular-nums text-ink-950">
                    {peso(l.paid, 0)}
                  </span>
                  {u !== null && (
                    <span className="block tabular-nums text-ink-800/45">
                      {unitPeso(u)}/{item.unit}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
