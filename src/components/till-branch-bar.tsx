"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MAIN_BRANCH_ID, visibleBranches, type Branch } from "@/lib/branches";

const KEY = "pepperpan.till.branch";

/**
 * Which branch this till is ringing up for, remembered on the device.
 *
 * ── Why the device and not the account ───────────────────────────────────
 *
 * The person at the booth is pinned to the booth and has nothing to choose.
 * The owner is pinned to nothing and does work a Friday night at El Mercado —
 * so taking the branch from the account would file that night's takings at
 * Apalit, which is the whole failure this feature exists to prevent arriving
 * through the back door.
 *
 * It sticks to the device because the tablet at the booth is at the booth all
 * night. A control the cashier has to set on every ticket is a control that
 * is wrong by lunchtime, and a wrong one here is silent.
 *
 * Browser storage can throw or come back empty — a private window, cleared
 * site data, a locked-down device — so every read and write is wrapped and
 * the fallback is always a real branch.
 */
/*
 * The chosen branch, as an external store rather than state in an effect.
 *
 * `useSyncExternalStore` instead of "read storage in a useEffect and
 * setState": the React Compiler rejects the latter outright, and it is right
 * to — that pattern renders once with the wrong answer and once with the
 * right one. This says "null on the server, the stored value in a browser",
 * which is exactly the question being asked, in one pass.
 *
 * The module-level override is what makes a choice visible immediately in the
 * tab that made it. A `storage` event only fires in OTHER tabs, so without it
 * the cashier would tap a branch and watch nothing happen.
 */
let chosen: string | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function snapshot(): string | null {
  if (chosen !== null) return chosen;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // A private window, cleared site data, a locked-down device. The caller
    // falls back to a real branch.
    return null;
  }
}

/* Nothing is remembered on the server, so the first paint matches the
   fallback and hydration has nothing to reconcile. */
const serverSnapshot = (): string | null => null;

export function useTillBranch(branches: Branch[], pinned: string | null) {
  const mine = visibleBranches(branches, { branchId: pinned });
  const fallback =
    pinned ?? mine.find((b) => b.id === MAIN_BRANCH_ID)?.id ?? mine[0]?.id ?? MAIN_BRANCH_ID;

  const saved = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  /* A pinned cashier never chooses, so a stale stored value from a shared
     device cannot pull their sales to another branch. */
  const branchId =
    pinned ??
    (saved && mine.some((b) => b.id === saved && b.active) ? saved : fallback);

  const choose = useCallback((id: string) => {
    chosen = id;
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      // The sale still carries the right branch; only the memory is lost.
    }
    listeners.forEach((l) => l());
  }, []);

  return { branchId, choose, choices: mine, locked: Boolean(pinned) };
}

/**
 * The strip above the till that says where this sale is going.
 *
 * Always shown once there is more than one branch, even when it cannot be
 * changed. A cashier who cannot see which branch they are ringing up for has
 * no way to notice the day somebody hands them the wrong tablet.
 */
export function TillBranchBar({
  branchId,
  choices,
  locked,
  onChoose,
}: {
  branchId: string;
  choices: Branch[];
  locked: boolean;
  onChoose: (id: string) => void;
}) {
  if (choices.length < 2) {
    // One branch in the whole business, or one this person may use. Saying
    // so would be noise, and noise is how a label stops being read.
    return null;
  }

  const here = choices.find((b) => b.id === branchId);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-ink-950/[0.04] px-4 py-3 ring-1 ring-ink-950/10">
      <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
        Ringing up for
      </span>

      {locked ? (
        <span className="font-display text-sm font-black text-ink-950">
          {here?.name ?? branchId}
        </span>
      ) : (
        <span className="flex flex-wrap gap-1.5">
          {choices.map((b) => (
            <button
              key={b.id}
              onClick={() => onChoose(b.id)}
              aria-pressed={b.id === branchId}
              disabled={!b.active}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-40 ${
                b.id === branchId
                  ? "bg-ink-950 text-cream-50"
                  : "bg-cream-50 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-100"
              }`}
            >
              {b.name}
            </button>
          ))}
        </span>
      )}

      {here?.tradingNote && (
        <span className="text-xs text-ink-800/50">{here.tradingNote}</span>
      )}
    </div>
  );
}
