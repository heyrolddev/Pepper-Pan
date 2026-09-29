/**
 * What the shop has bought from one supplier, and what it paid each time.
 *
 * ── What was asked for ───────────────────────────────────────────────────
 *
 * "maganda if yung mga ingredient na binibili namin dun sa specific
 *  supplier dapat pwede ilagay ang price if magkano naman nabili iyun para
 *  may history hindi lang basta list ng ingredient kundi may price para may
 *  pagbabasihan at history"
 *
 * The recording already happened: every delivery writes a `purchase_log`
 * row carrying the supplier, the ingredient, how much and what was paid. The
 * supplier screen simply never read any of it — it showed a free-text note
 * saying what they sell, which is a label, not a basis for anything.
 *
 * ── The figure that is actually worth having ─────────────────────────────
 *
 * Not the amount paid. A ₱1,150 delivery and a ₱250 delivery tell you
 * nothing until you know one was five kilos and the other was one. The
 * comparable number is the UNIT price, and it is the only one that answers
 * the question somebody is really asking — is this getting more expensive,
 * and is somebody else cheaper?
 *
 * So both are kept and the unit price is what the trend and the comparison
 * are built from.
 *
 * ── Two deliveries is not a trend ────────────────────────────────────────
 *
 * The change is measured against the PREVIOUS purchase of the same thing
 * from the same supplier, and reported as nothing at all when there is no
 * previous one. A first delivery has no direction, and drawing an arrow on
 * it would be inventing information about the shop's own costs.
 *
 * Deliberately free of imports so `node --test` can read it directly.
 */

export type PurchaseLine = {
  id: string;
  date: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  supplierId: string | null;
  supplierName: string | null;
  /** How much arrived. */
  qty: number;
  /** What was paid in total for that quantity. */
  paid: number;
};

export type PriceMove = "up" | "down" | "same" | "first";

export type SupplierItem = {
  ingredientId: string;
  name: string;
  unit: string;
  /** Deliveries of this thing from this supplier. */
  times: number;
  /** Everything ever paid for it here. */
  spent: number;
  /** Total quantity taken. */
  qty: number;
  lastOn: string;
  lastPaid: number;
  lastQty: number;
  /** Pesos per unit, last time. Null when a delivery recorded no quantity. */
  lastUnit: number | null;
  /** The unit price before that, for the comparison. */
  previousUnit: number | null;
  move: PriceMove;
  /** How much the unit price moved, as a fraction. Null on a first buy. */
  change: number | null;
  /** Every delivery, newest first, so the row can be opened up. */
  lines: PurchaseLine[];
};

const money = (n: number) => Math.round(n * 100) / 100;

/** Pesos per unit, or null when the delivery recorded no quantity to divide by. */
export function unitPrice(line: { qty: number; paid: number }): number | null {
  const qty = Number(line.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const paid = Number(line.paid);
  if (!Number.isFinite(paid)) return null;
  return paid / qty;
}

/**
 * One supplier's purchases, grouped by what was bought.
 *
 * Sorted by what the shop spends most on here, because that is the row where
 * a price move is worth arguing about. An item bought once for forty pesos
 * does not need to be at the top of anything.
 */
export function supplierItems(lines: PurchaseLine[]): SupplierItem[] {
  const groups = new Map<string, PurchaseLine[]>();
  for (const l of lines) {
    groups.set(l.ingredientId, [...(groups.get(l.ingredientId) ?? []), l]);
  }

  const out: SupplierItem[] = [];
  for (const [ingredientId, all] of groups) {
    // Newest first, and that order is what `lastUnit` and `previousUnit`
    // mean — getting it backwards would report every rise as a fall.
    const sorted = [...all].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1
    );
    const last = sorted[0];
    const lastUnit = unitPrice(last);

    // The previous delivery that actually had a unit price. A delivery
    // recorded with no quantity cannot be compared against, and skipping it
    // is more honest than treating it as zero.
    let previousUnit: number | null = null;
    for (const l of sorted.slice(1)) {
      const u = unitPrice(l);
      if (u !== null) {
        previousUnit = u;
        break;
      }
    }

    let move: PriceMove = "first";
    let change: number | null = null;
    if (lastUnit !== null && previousUnit !== null && previousUnit > 0) {
      change = (lastUnit - previousUnit) / previousUnit;
      // Under a centavo in the peso is rounding, not a price change. An
      // arrow on that trains people to ignore the arrows.
      move = Math.abs(change) < 0.01 ? "same" : change > 0 ? "up" : "down";
    }

    out.push({
      ingredientId,
      name: last.ingredientName,
      unit: last.unit,
      times: sorted.length,
      spent: money(sorted.reduce((s, l) => s + (Number(l.paid) || 0), 0)),
      qty: Math.round(sorted.reduce((s, l) => s + (Number(l.qty) || 0), 0) * 1000) / 1000,
      lastOn: last.date,
      lastPaid: money(Number(last.paid) || 0),
      lastQty: Number(last.qty) || 0,
      lastUnit,
      previousUnit,
      move,
      change,
      lines: sorted,
    });
  }

  return out.sort((a, b) => b.spent - a.spent);
}

export type Cheaper = {
  supplierId: string | null;
  supplierName: string;
  unit: number;
  on: string;
  /** How much less, as a fraction of what this supplier charges. */
  saving: number;
};

/**
 * Somebody else selling the same thing for less — the "pagbabasihan".
 *
 * A price history on its own says whether a supplier is getting dearer. It
 * cannot say whether they were ever the right choice. That needs the other
 * suppliers' prices for the same ingredient, which the shop already has and
 * has never been shown side by side.
 *
 * Compared on the LAST price each supplier charged, not their average:
 * what a supplier charged in March is not an offer anybody can take today.
 *
 * Returns nothing when the difference is under a twentieth. Two suppliers
 * within five per cent of each other is not a reason to change who delivers
 * at six in the morning, and a screen that says so every week is a screen
 * that gets ignored.
 */
export function cheaperElsewhere(
  item: { ingredientId: string; lastUnit: number | null },
  others: PurchaseLine[]
): Cheaper | null {
  if (item.lastUnit === null || item.lastUnit <= 0) return null;

  const best = new Map<string, PurchaseLine>();
  for (const l of others) {
    if (l.ingredientId !== item.ingredientId) continue;
    const key = l.supplierId ?? `name:${l.supplierName ?? ""}`;
    const kept = best.get(key);
    if (!kept || l.date > kept.date) best.set(key, l);
  }

  let found: Cheaper | null = null;
  for (const l of best.values()) {
    const u = unitPrice(l);
    if (u === null || u >= item.lastUnit) continue;
    const saving = (item.lastUnit - u) / item.lastUnit;
    if (saving < 0.05) continue;
    if (!found || u < found.unit) {
      found = {
        supplierId: l.supplierId,
        supplierName: l.supplierName?.trim() || "another supplier",
        unit: u,
        on: l.date,
        saving,
      };
    }
  }
  return found;
}

/** What a supplier has cost the shop in total, for the row itself. */
export function supplierTotal(items: SupplierItem[]): {
  spent: number;
  items: number;
  lastOn: string | null;
} {
  return {
    spent: money(items.reduce((s, i) => s + i.spent, 0)),
    items: items.length,
    lastOn: items.reduce<string | null>(
      (latest, i) => (latest === null || i.lastOn > latest ? i.lastOn : latest),
      null
    ),
  };
}
