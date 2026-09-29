/**
 * Everything that moved one ingredient, from the ledgers that recorded it.
 *
 * ── What this replaces ───────────────────────────────────────────────────
 *
 * The history searched the ACTIVITY LOG for the ingredient's NAME. Three
 * things followed, and all three were wrong:
 *
 *   A sale writes no activity line naming an ingredient. It writes to
 *   `consumption_log`, which the history never read — so every order, online
 *   and at the counter, was invisible. That is what the shop noticed.
 *
 *   Renaming an ingredient erased its whole history, because the search WAS
 *   the name.
 *
 *   "Pork" matched "Pork Belly", "Ground Pork" and "BP Pork Batch". A history
 *   showing another ingredient's movements is worse than an empty one: an
 *   empty one is obviously empty.
 *
 * ── What it reads instead ────────────────────────────────────────────────
 *
 * The three ledgers that are written by every path that touches stock, all
 * keyed by id rather than by text:
 *
 *   `purchase_log`     what came in, from whom, at what price
 *   `consumption_log`  everything that took it out — a sale, a counter sale,
 *                      a batch, a staff meal, a count correction
 *   `waste_log`        what was thrown away, and why
 *
 * Deliberately free of imports so `node --test` can read it directly.
 */

export type MoveKind = "in" | "out";

export type IngredientMove = {
  id: string;
  /** The shop's own day. */
  date: string;
  /** Tie-breaker within a day, so four lines off one sale keep their order. */
  at: string;
  kind: MoveKind;
  /** Always positive. `kind` carries the direction. */
  qty: number;
  /** What it was, in the shop's words. */
  note: string;
  /** Pesos, when the movement had a price. Null when it did not. */
  cost: number | null;
  /** Where the line came from, for the tone on screen. */
  source: "purchase" | "sale" | "batch" | "internal" | "waste" | "count" | "other";
};

export type PurchaseRow = {
  id: string;
  date: string;
  qty: number;
  cost: number | null;
  supplier: string | null;
};

export type ConsumptionRow = {
  id: string;
  date: string;
  created_at: string | null;
  qty: number;
  type: string | null;
  note: string | null;
};

export type WasteRow = {
  id: string;
  date: string;
  created_at: string | null;
  qty: number;
  reason: string | null;
  total_cost: number | null;
};

/**
 * The type a consumption row carries, turned into something to read.
 *
 * Rows written before 0069 have no note — that column did not exist — so
 * they fall back to the type. Shown as a sentence rather than the bare word,
 * because "sale" on a line of its own is not a description of anything.
 */
export function describeType(type: string | null): { text: string; source: IngredientMove["source"] } {
  switch (type) {
    case "sale":
      return { text: "Sold", source: "sale" };
    case "batch":
      return { text: "Used making a batch", source: "batch" };
    case "internal":
      return { text: "Staff meal or internal use", source: "internal" };
    case "waste":
      return { text: "Thrown away", source: "waste" };
    case "count":
      return { text: "Stock count correction", source: "count" };
    default:
      return { text: "Used", source: "other" };
  }
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * One timeline, newest first.
 *
 * `date` decides the day and `at` decides the order within it, which is the
 * same split `cash_ledger` uses. A row with no timestamp — anything written
 * before 0069 — sorts to the start of its own day rather than to the start
 * of time, because the day it names is a fact and the hour is merely unknown.
 */
export function ingredientMoves(input: {
  purchases: PurchaseRow[];
  consumption: ConsumptionRow[];
  waste: WasteRow[];
}): IngredientMove[] {
  const moves: IngredientMove[] = [];

  for (const p of input.purchases) {
    moves.push({
      id: `p:${p.id}`,
      date: p.date,
      at: `${p.date}T00:00:00.000Z`,
      kind: "in",
      qty: Math.abs(num(p.qty)),
      note: p.supplier?.trim()
        ? `Delivered by ${p.supplier.trim()}`
        : "Delivered",
      cost: p.cost === null ? null : num(p.cost),
      source: "purchase",
    });
  }

  for (const c of input.consumption) {
    const fallback = describeType(c.type);
    const qty = num(c.qty);
    moves.push({
      id: `c:${c.id}`,
      date: c.date,
      at: c.created_at ?? `${c.date}T00:00:00.000Z`,
      /* A count correction that FOUND stock is written as a negative
         quantity — consuming minus ten is adding ten — so the direction is
         read off the number, not assumed from the table it came from. */
      kind: qty < 0 ? "in" : "out",
      qty: Math.abs(qty),
      note: c.note?.trim() || fallback.text,
      cost: null,
      source: fallback.source,
    });
  }

  for (const w of input.waste) {
    moves.push({
      id: `w:${w.id}`,
      date: w.date,
      at: w.created_at ?? `${w.date}T00:00:00.000Z`,
      kind: "out",
      qty: Math.abs(num(w.qty)),
      note: w.reason?.trim() ? `Thrown away — ${w.reason.trim()}` : "Thrown away",
      cost: w.total_cost === null ? null : num(w.total_cost),
      source: "waste",
    });
  }

  return moves.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}

/**
 * What the period added up to, so the list has a headline.
 *
 * Counted from the same rows the list shows, never queried separately: two
 * queries for one figure is how a total comes to disagree with the lines
 * underneath it, and the lines are the ones somebody will check.
 */
export function movesSummary(moves: IngredientMove[]): {
  inQty: number;
  outQty: number;
  net: number;
  spent: number;
} {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const inQty = moves.filter((m) => m.kind === "in").reduce((s, m) => s + m.qty, 0);
  const outQty = moves.filter((m) => m.kind === "out").reduce((s, m) => s + m.qty, 0);
  return {
    inQty: round(inQty),
    outQty: round(outQty),
    net: round(inQty - outQty),
    spent:
      Math.round(
        moves
          .filter((m) => m.source === "purchase")
          .reduce((s, m) => s + (m.cost ?? 0), 0) * 100
      ) / 100,
  };
}
