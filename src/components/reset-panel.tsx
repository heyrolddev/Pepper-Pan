"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  resetShopData,
  type ResetCounts,
  type ResetScope,
} from "@/app/admin/reset/actions";

/**
 * The most destructive control in the system, built to feel like it.
 *
 * Three deliberate obstacles, each stopping a different mistake: choosing what
 * goes (so nothing is deleted by surprise), typing RESET (so a mis-tap can't),
 * and the password (so a tablet left signed in on the counter can't). None of
 * them is friction for its own sake — each one is the answer to a way this
 * could ruin an afternoon.
 */
export function ResetPanel({ counts }: { counts: ResetCounts }) {
  const router = useRouter();
  const [scope, setScope] = useState<ResetScope>({
    orders: true,
    menu: false,
    chat: true,
  });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);

  const ITEMS: {
    key: keyof ResetScope;
    label: string;
    detail: string;
    count: number;
  }[] = [
    {
      key: "orders",
      label: "Orders and reviews",
      detail: "Every order, its items, and the reviews written about them.",
      count: counts.orders + counts.reviews,
    },
    {
      key: "chat",
      label: "Chat and taught answers",
      detail: "Ask Pepper Pan threads, and the answers you taught it.",
      count: counts.chats,
    },
    {
      key: "menu",
      label: "The whole menu",
      detail: "Every dish, so you can type the real menu from scratch.",
      count: counts.meals,
    },
  ];

  const chose = scope.orders || scope.menu || scope.chat;
  const ready = chose && password.length > 0 && confirmation.trim().toUpperCase() === "RESET";

  async function run() {
    setBusy(true);
    setError(null);
    const res = await resetShopData({ password, confirmation, scope });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    setDone(res.deleted);
    setPassword("");
    setConfirmation("");
    setBusy(false);
    router.refresh();
  }

  if (done) {
    return (
      <div className="rounded-3xl bg-jade-50 p-6 ring-2 ring-jade-600/40">
        <p className="font-display text-xl font-black text-jade-700">
          Cleared. You&apos;re starting fresh.
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-800/70">
          {done.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-800/60">
          Your hours, delivery, payment details and every account were left
          exactly as they were.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-cream-100 p-6 ring-2 ring-brand-600/40">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-700">
        Step 1 · What goes
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {ITEMS.map((item) => (
          <li key={item.key}>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10">
              <input
                type="checkbox"
                checked={scope[item.key]}
                onChange={(e) =>
                  setScope((s) => ({ ...s, [item.key]: e.target.checked }))
                }
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
              />
              <span className="min-w-0">
                <span className="block font-bold text-ink-950">
                  {item.label}{" "}
                  <span className="font-normal text-ink-800/50">
                    · {item.count} row{item.count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="block text-sm text-ink-800/60">{item.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs font-bold uppercase tracking-widest text-brand-700">
        Step 2 · Prove it&apos;s you
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-ink-950">
            Your password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            className="rounded-xl bg-cream-50 px-4 py-3 ring-1 ring-ink-950/15 outline-none focus:ring-2 focus:ring-brand-600"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-ink-950">
            Type <strong className="font-mono">RESET</strong> to confirm
          </span>
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="RESET"
            className="rounded-xl bg-cream-50 px-4 py-3 font-mono uppercase tracking-widest ring-1 ring-ink-950/15 outline-none focus:ring-2 focus:ring-brand-600"
          />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}

      <button
        onClick={run}
        disabled={!ready || busy}
        className="mt-6 w-full rounded-full bg-brand-600 px-6 py-4 font-black text-cream-50 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      >
        {busy ? "Clearing…" : "Clear the data I ticked"}
      </button>

      <p className="mt-3 text-center text-xs text-ink-800/50">
        There is no undo. Nothing here touches your hours, delivery, payment
        details, saved devices or any account.
      </p>
    </div>
  );
}
