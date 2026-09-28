/**
 * Throwing several things away at once.
 *
 * Waste does not arrive one ingredient at a time. The fridge is left open
 * overnight and in the morning it is the pork, the beansprouts, the sauce and
 * half a batch of dumplings — four things, one reason, one moment. The form
 * took one item per dialog, so logging that morning meant opening, picking,
 * typing, submitting and reopening four times. What actually happened is that
 * the shop logged the pork, decided it had got the idea, and the other three
 * silently became a stock count discrepancy a fortnight later.
 *
 * That is the failure this file is about, and it is not a convenience
 * problem. A waste log that is tedious is a waste log that is incomplete, and
 * an incomplete waste log does not look incomplete — it looks like a shop
 * with less spoilage than it has.
 *
 * ── What is shared and what is per line ──────────────────────────────────
 *
 * The category (wasted / internal use) and the reason are shared across the
 * whole batch, because the thing that makes several lines one submission IS
 * the shared reason. Per-line reasons would be more expressive and would cost
 * a control on every row on a phone — and the one case they serve, a staff
 * meal and a spillage in the same submission, is already two categories and
 * therefore two submissions anyway.
 *
 * Quantity and item are per line. Obviously.
 */

/**
 * What can be thrown away.
 *
 * A whole DISH joined the two on 0063, and it is the one that actually gets
 * thrown away at a stall: a serving dropped on the way to a table, a bowl
 * cooked for the wrong order, a plate the staff ate at the end of a shift.
 * Logging that as its parts — 180g noodles, 100g chicken, one egg — is
 * something nobody does with a queue waiting, so it did not get logged at
 * all, and the count drifted from the shelf with nothing to say why.
 *
 * Its `unitCost` is the dish's COGS, never its menu price. A staff meal is
 * not a ₱179 sale the shop missed; it is the ₱62 of food that left the
 * building, and pricing it at the menu would overstate every loss.
 */
export type WasteKind = "inv" | "batch" | "meal";

/** What the item picker knows about one thing that can be thrown away. */
export type Wastable = {
  kind: WasteKind;
  id: string;
  name: string;
  unit: string;
  stock: number;
  unitCost: number;
};

/** One row of the form, exactly as typed. */
export type WasteDraft = {
  /** Stable across re-renders so React keys and problems can point at a row. */
  key: string;
  /** "inv:abc" / "batch:def", or "" while nothing is picked. */
  pick: string;
  /** As typed, so a half-written "1." does not become 1. */
  qty: string;
};

/** A row that is ready to be written. */
export type WasteLine = {
  key: string;
  kind: WasteKind;
  id: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
  stock: number;
  cost: number;
};

export type WasteProblem = { key: string; what: string };

/**
 * Sort the typed rows into the ones that can be written and the ones that
 * cannot, with a reason for each of the latter.
 *
 * Wholly blank rows are neither: a form that starts with three empty rows
 * would otherwise open showing three complaints, which trains people to
 * ignore the complaints.
 */
export function readyLines(
  drafts: WasteDraft[],
  catalogue: Map<string, Wastable>
): { ready: WasteLine[]; problems: WasteProblem[] } {
  const ready: WasteLine[] = [];
  const problems: WasteProblem[] = [];

  for (const d of drafts) {
    const blank = d.pick === "" && d.qty.trim() === "";
    if (blank) continue;

    const item = catalogue.get(d.pick);
    if (!item) {
      problems.push({ key: d.key, what: "Pick what it was." });
      continue;
    }
    const qty = Number(d.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      problems.push({ key: d.key, what: `How much ${item.name}?` });
      continue;
    }
    ready.push({
      key: d.key,
      kind: item.kind,
      id: item.id,
      name: item.name,
      unit: item.unit,
      qty,
      unitCost: item.unitCost,
      stock: item.stock,
      cost: item.unitCost * qty,
    });
  }

  return { ready, problems };
}

/** What the whole submission cost the shop. */
export function wasteTotal(lines: WasteLine[]): number {
  return lines.reduce((s, l) => s + l.cost, 0);
}

/** Lines asking to remove more than the shelf says is there. */
export function overStock(lines: WasteLine[]): WasteLine[] {
  /* A DISH has no shelf of its own — it is made when it is ordered — so its
     `stock` is 0 and every dish line would read as "more than you have".
     That warning would be false on every one of them, and a warning that is
     always wrong is a warning people learn to tap past on the day it is
     right about an ingredient. Whether the shelf can actually cover the
     dish is a real question and a different one; `limitingFor` answers it
     where it belongs, on the till. */
  return lines.filter((l) => l.kind !== "meal" && l.qty > l.stock);
}

/**
 * Items that appear on more than one line.
 *
 * Not an error — two spoiled trays of the same thing found at different
 * times is a legitimate two rows — but worth saying out loud, because the
 * other way it happens is somebody adding a corrected row and forgetting to
 * clear the wrong one. Both deduct. Silently double-deducting stock is the
 * exact kind of quiet wrongness this system keeps being bitten by.
 */
export function doubledUp(lines: WasteLine[]): string[] {
  const seen = new Map<string, number>();
  for (const l of lines) {
    const key = `${l.kind}:${l.id}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const names = new Map<string, string>();
  for (const l of lines) names.set(`${l.kind}:${l.id}`, l.name);
  return [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([key]) => names.get(key) ?? key);
}

/**
 * What to say after a run that did not entirely work.
 *
 * Several lines are written one at a time — each one moves stock through its
 * own database call — so a failure halfway through leaves the earlier ones
 * applied. Reporting that as "failed" is a lie that makes somebody log the
 * first three twice; reporting it as "done" is the worse lie. It has to name
 * both halves.
 */
export function partialReport(
  done: string[],
  failed: { name: string; why: string }[]
): string | null {
  if (failed.length === 0) return null;
  if (done.length === 0) {
    return failed.length === 1
      ? `${failed[0].name} could not be logged — ${failed[0].why}`
      : `None of the ${failed.length} lines were logged. ${failed[0].name}: ${failed[0].why}`;
  }
  return (
    `${done.length} of ${done.length + failed.length} logged. ` +
    `${failed.map((f) => `${f.name} (${f.why})`).join(", ")} did not — ` +
    `everything else is already in, so only fix ${failed.length === 1 ? "that one" : "those"}.`
  );
}
