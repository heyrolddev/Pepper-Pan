/**
 * One way to write an amount of money, for the whole shop.
 *
 * There were eleven. Ten screens each declared their own `const peso` at the
 * top of the file — six of them `"₱" + n.toFixed(2)`, four a `toLocaleString`
 * — so the same ₱1,250 order was written `₱1250.00` on the customer's
 * checkout and `₱1,250.00` on the owner's ledger, and a refund read `₱-150.00`
 * on one screen and `−₱150.00` on another. Nothing was *wrong* anywhere; the
 * shop just spoke in two accents, which is the sort of thing a customer reads
 * as sloppiness and an owner reads as two different numbers.
 *
 * Kept in its own file rather than in `costing.ts`, where it used to live.
 * The checkout and the floating cart need this and nothing else from costing,
 * and a customer's phone should not download seven hundred lines of
 * margin arithmetic to render a total. `costing.ts` re-exports both names, so
 * every existing `import { peso } from "@/lib/costing"` keeps working.
 */

/** ₱1,234.50 — two decimals, because ingredient costs live in centavos. */
export function peso(n: number, decimals = 2): string {
  // The sign goes outside the symbol. "₱-1.25" reads as a currency code
  // followed by a number and is easy to skim straight past — which is the
  // worst possible place to lose a minus, since a dish that loses money once
  // it's boxed is exactly the thing this screen exists to surface.
  const sign = n < 0 ? "−" : "";
  return (
    sign +
    "₱" +
    Math.abs(n).toLocaleString("en-PH", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

/**
 * Whole pesos, for a headline figure.
 *
 * Centavos on a day's takings are three characters that never change a
 * decision, and on an *average* they are false precision. Exact amounts still
 * appear to the centavo where they are actually owed — an order total, a
 * payment, a receipt — which is what `peso` above is for.
 *
 * Lives here rather than beside the tile that renders it, and that is the
 * whole point of moving it: the tile had to become a client component to
 * animate, and a pure function that happens to share a file with a component
 * gets dragged across the client boundary with it. A server component then
 * cannot call it at all — which is exactly how the owner's Today screen
 * started returning "a server error occurred".
 */
export function pesoRound(n: number): string {
  const sign = n < 0 ? "−" : "";
  return sign + "₱" + Math.round(Math.abs(n)).toLocaleString("en-PH");
}

/**
 * A unit cost, to as many decimals as it actually needs.
 *
 * `peso(n, 4)` on a batch that costs ₱18.75 a pack prints "₱18.7510" — which
 * the owner read, reasonably, as "₱18.75" with a stray 10 stuck on the end,
 * sitting two words away from a "₱18.75 a batch" that was the same number.
 * Four decimals exist for a good reason: a gram of salt is ₱0.0012, and
 * rounding that to ₱0.00 makes a whole recipe read as free. But a cost that
 * lands on ₱18.75 does not need them, and spending them anyway turns a
 * readable figure into a puzzle.
 *
 * So the precision is given to the figures that need it and taken back from
 * the ones that don't: up to four decimals, trailing zeros trimmed, and
 * never fewer than two, because money below a peso still looks like money.
 */
export function unitPeso(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  // Rounded first, so 18.750999 does not keep a decimal it does not have.
  const at4 = Math.round(abs * 10000) / 10000;
  const decimals = Math.max(
    2,
    Math.min(4, ((at4.toString().split(".")[1] ?? "").length))
  );
  return (
    sign +
    "₱" +
    at4.toLocaleString("en-PH", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}
