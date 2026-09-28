/**
 * How long a thing the shop buys actually lasts.
 *
 * An 11kg tank, a pack of tissue, a bottle of Joy, a box of receipt rolls.
 * The shop buys them, they sit in the stall, and one day they are gone. No
 * recipe uses them, nobody can weigh what one bowl of noodles consumed, and
 * the only honest measurement available is the one the owner already offered
 * to make by hand: the day it was bought, and the day it ran out.
 *
 * ── Why this replaces guessing from the gaps ──────────────────────────────
 *
 * `tankLife` in `spending.ts` estimates a gas tank's life from the gap
 * between one refill and the next. That works for something replaced the day
 * it dies and is wrong for everything else. Buy three tanks at once and two
 * of them read as lasting no time at all. Buy a spare in advance and every
 * estimate afterwards is short. And a gap cannot tell "still using it" from
 * "ran out three weeks ago and nobody has bought more" — which is the one
 * state actually worth a warning.
 *
 * A recorded end date has none of those problems, because it is an
 * observation rather than an inference.
 *
 * ── What a sub-day life means ─────────────────────────────────────────────
 *
 * Bought and finished the same day is a real thing, and the shop does not
 * record hours. So a lifespan floors at one day rather than returning zero:
 * zero would make an average of zero, and a reorder warning built on zero
 * fires forever and gets ignored.
 *
 * Deliberately free of imports so `node --test` can read it directly.
 */

export type SupplyRow = {
  id: string;
  /** As the owner typed it. */
  label: string;
  /** Gas carries one: "11kg", "22kg". Part of the item's identity. */
  sizeLabel: string | null;
  amount: number;
  /** How many of the thing this one purchase covered. */
  qty: number;
  spentOn: string;
  /** Null while it is still in use. */
  ranOutOn: string | null;
};

export type ItemLife = {
  /** The grouping key — normalized, never shown. */
  key: string;
  /** The most recent spelling, shown as the owner last typed it. */
  name: string;
  /** How many purchases of it have been used up. */
  finished: number;
  /** How many units those covered — three tanks in one purchase is three. */
  units: number;
  /** Median days ONE of them lasts. Null until something has run out. */
  days: number | null;
  /** Purchases still going. */
  open: number;
  /** Days the oldest open purchase has been running. Null when none is. */
  openFor: number | null;
  /** An open purchase has passed the usual life — time to buy. */
  dueNow: boolean;
  /** What one unit cost last time. The price moves; the last one is useful. */
  lastUnitCost: number;
  /** The most recent purchase date. */
  lastOn: string;
  /** Everything ever spent on this item. */
  spent: number;
};

const dayOf = (iso: string) => new Date(iso + "T00:00:00Z").getTime() / 864e5;

/**
 * The identity two purchases have to share to be the same thing.
 *
 * Case and stray spaces folded, because "Tissue", "tissue " and "Tissue"
 * typed on three different evenings are one item, and treating them as three
 * gives three averages of one purchase each — all of them useless, and none
 * of them saying why.
 *
 * The size is part of it. An 11kg tank and a 22kg tank are not the same
 * thing, and one average across both describes neither.
 */
export function itemKey(label: string, sizeLabel: string | null): string {
  const fold = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const size = (sizeLabel ?? "").trim();
  return size ? `${fold(label)} · ${fold(size)}` : fold(label);
}

/** The name as it should read on screen — the typed label, plus the size. */
export function itemName(label: string, sizeLabel: string | null): string {
  const size = (sizeLabel ?? "").trim();
  const name = label.trim().replace(/\s+/g, " ");
  return size ? `${name} (${size})` : name;
}

/**
 * How many days ONE of them lasted, or null while it is still going.
 *
 * Divided by the count, which is the whole reason `qty` exists: three tanks
 * bought together and burned one after another is one row and three
 * lifespans, and without the division the average comes out threefold and
 * the reorder warning fires two tanks too late.
 */
export function lifespanDays(row: SupplyRow): number | null {
  if (!row.ranOutOn) return null;
  const span = dayOf(row.ranOutOn) - dayOf(row.spentOn);
  if (!Number.isFinite(span) || span < 0) return null;
  const qty = row.qty > 0 ? row.qty : 1;
  // Floored at a day before dividing: see the note at the top.
  return Math.max(1, span) / qty;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Every item the shop buys, and what its own history says about it.
 *
 * Median rather than mean, for the reason `tankLife` already gives: one
 * fiesta week where two tanks went in three days would drag the estimate
 * down for months, and a warning that fires too early is a warning nobody
 * reads.
 *
 * Sorted by what needs buying first. An item with an open purchase past its
 * usual life comes top, because that is the only row here anybody has to act
 * on today.
 */
export function supplyLife(rows: SupplyRow[], today: string): ItemLife[] {
  const now = dayOf(today);
  const groups = new Map<string, SupplyRow[]>();

  for (const row of rows) {
    const key = itemKey(row.label, row.sizeLabel);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const out: ItemLife[] = [];

  for (const [key, all] of groups) {
    const byDate = [...all].sort((a, b) =>
      a.spentOn < b.spentOn ? -1 : a.spentOn > b.spentOn ? 1 : 0
    );
    const last = byDate[byDate.length - 1];

    const lives = byDate
      .map(lifespanDays)
      .filter((d): d is number => d !== null);
    const finishedRows = byDate.filter((r) => r.ranOutOn !== null);
    const openRows = byDate.filter((r) => r.ranOutOn === null);

    const days = lives.length > 0 ? Math.max(1, Math.round(median(lives))) : null;

    // The oldest open one is the one running out first, so it is the one the
    // warning is about.
    const openFor =
      openRows.length > 0
        ? Math.max(0, Math.round(now - dayOf(openRows[0].spentOn)))
        : null;

    out.push({
      key,
      name: itemName(last.label, last.sizeLabel),
      finished: finishedRows.length,
      units: finishedRows.reduce((s, r) => s + (r.qty > 0 ? r.qty : 1), 0),
      days,
      open: openRows.length,
      openFor,
      dueNow: days !== null && openFor !== null && openFor >= days,
      lastUnitCost: last.qty > 0 ? last.amount / last.qty : last.amount,
      lastOn: last.spentOn,
      spent: byDate.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    });
  }

  return out.sort((a, b) => {
    // Due first, then the closest to due, then the ones with no estimate.
    const left = (i: ItemLife) =>
      i.days === null || i.openFor === null ? Infinity : i.days - i.openFor;
    const d = left(a) - left(b);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
}

/**
 * A number of days, said the way a person would say it.
 *
 * The owner asked for days, weeks or months, and the right one depends on
 * the number: "about 3 weeks" is what somebody plans around, "21 days" is
 * what they count. Both get shown — this is the readable half.
 */
export function humanSpan(days: number): string {
  if (days < 1) return "less than a day";
  if (days < 14) return days === 1 ? "1 day" : `${Math.round(days)} days`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? "about a week" : `about ${weeks} weeks`;
  }
  const months = Math.round(days / 30);
  return months === 1 ? "about a month" : `about ${months} months`;
}

/**
 * What one of them costs the shop a day.
 *
 * The figure that makes two sizes comparable: a 22kg tank at ₱1,300 lasting
 * 26 days is cheaper per day than an 11kg at ₱750 lasting 12, and nothing on
 * the screen says so until the division is done.
 */
export function costPerDay(item: ItemLife): number | null {
  if (item.days === null || item.days <= 0) return null;
  return item.lastUnitCost / item.days;
}
