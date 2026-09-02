/**
 * Counting out change.
 *
 * Plain functions in their own file rather than inside the till component,
 * and that is deliberate: the till is a client component, and anything living
 * in a client module cannot be called from the server. That is not a
 * hypothetical — it is what took the owner's Today screen down, and a
 * formatter that was only ever going to be used in the browser is exactly how
 * it happened. Arithmetic goes in a library; components render it.
 */

/**
 * What the customer is likely to hand over, for a given total.
 *
 * A fixed row of denominations (20 / 50 / 100 / …) is the obvious design and
 * the wrong one: on a ₱278 order, four of the six are useless and the two that
 * aren't still need adding up. What is actually useful is the exact amount and
 * the few round numbers just above it — which is what people really hand over.
 *
 * So the suggestions are computed from the total: the next fifty, hundred,
 * five hundred and thousand above it. On ₱278 that is 300 / 500 / 1000, and on
 * ₱129 it is 150 / 200 / 500 / 1000. Nothing below the total is offered,
 * because that is not a payment, it is a mistake waiting to be tapped.
 */
export function tenderSuggestions(total: number): number[] {
  if (!(total > 0)) return [];
  const roundUp = (to: number) => Math.ceil(total / to) * to;
  const seen = new Set<number>();
  const out: number[] = [];
  // Exact first: it is the single most common answer at a stall, and putting
  // it anywhere but first makes the commonest case the slowest one.
  for (const n of [total, roundUp(50), roundUp(100), roundUp(500), roundUp(1000)]) {
    const v = Math.round(n);
    if (v >= total && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out.slice(0, 5);
}

export type ChangeState =
  | { kind: "none"; short: 0; change: 0 }
  | { kind: "short"; short: number; change: 0 }
  | { kind: "exact"; short: 0; change: 0 }
  | { kind: "change"; short: 0; change: number };

/**
 * What to hand back.
 *
 * "Short" is a real state and not an error: money is often put down in
 * handfuls, and a till that refuses a part-payment mid-count is a till that
 * gets abandoned. It says what is still missing and lets the count continue.
 *
 * Compared in centavos rather than pesos so a total ending .5 doesn't report
 * a one-centavo shortfall that nobody can pay — floating point on money is
 * how a till ends up asking for ₱0.0000001.
 */
export function changeFor(total: number, tendered: number | null): ChangeState {
  if (tendered === null || !Number.isFinite(tendered) || tendered <= 0) {
    return { kind: "none", short: 0, change: 0 };
  }
  const diff = Math.round(tendered * 100) - Math.round(total * 100);
  if (diff < 0) return { kind: "short", short: -diff / 100, change: 0 };
  if (diff === 0) return { kind: "exact", short: 0, change: 0 };
  return { kind: "change", short: 0, change: diff / 100 };
}
