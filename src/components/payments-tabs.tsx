"use client";

import { useState, type ReactNode } from "react";

/**
 * Two different jobs that were sharing one page badly.
 *
 * "How customers may pay" is set up once and then left alone for months.
 * "Who owes what" is checked between orders, every day. Stacking them meant
 * scrolling past a settings form to reach the daily work — and the daily work
 * wasn't even there, which is why the tab's badge pointed at nothing.
 *
 * The money comes first because that's what the badge is counting and what
 * brings anyone here.
 */
export function PaymentsTabs({
  ledger,
  settings,
  waiting,
}: {
  ledger: ReactNode;
  settings: ReactNode;
  /** Receipts to check — shown on the tab, so the badge has a destination. */
  waiting: number;
}) {
  const [tab, setTab] = useState<"money" | "setup">("money");

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
      active
        ? "bg-ink-950 text-gold-400 ring-2 ring-ink-950/20"
        : "text-ink-800 hover:bg-ink-950/5"
    }`;

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" className="flex flex-wrap gap-1.5">
        <button
          role="tab"
          aria-selected={tab === "money"}
          onClick={() => setTab("money")}
          className={tabClass(tab === "money")}
        >
          Money to check
          {waiting > 0 && (
            <span
              className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-black tabular-nums ${
                tab === "money" ? "bg-cream-50/15" : "bg-brand-600 text-cream-50"
              }`}
            >
              {waiting > 99 ? "99+" : waiting}
            </span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={tab === "setup"}
          onClick={() => setTab("setup")}
          className={tabClass(tab === "setup")}
        >
          How customers pay
        </button>
      </div>

      {tab === "money" ? ledger : settings}
    </div>
  );
}
