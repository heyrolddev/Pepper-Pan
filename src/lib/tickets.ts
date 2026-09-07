/**
 * An order's ticket — the short number both sides of the counter can say.
 *
 * The uuid is the key; this is the handle. It goes on the receipt, on the
 * board, and into every activity-log line, so a record the owner reads a week
 * later points at something they can actually find in Orders.
 *
 * Four digits is the shop's own scale — a stall that sells a couple of hundred
 * a week is years from five — and it stops padding rather than truncating, so
 * the ten-thousandth order reads #10000 instead of colliding with #0000.
 */
export function ticketOf(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "----";
  return `#${String(Math.trunc(n)).padStart(4, "0")}`;
}

/**
 * How an order should be named in a record, given whatever it has.
 *
 * A name is better than a number and a number is better than nothing, but the
 * number always comes too: "Maria" is ambiguous by the third Maria, and
 * "#0042 — Maria" is not.
 */
export function orderLabel(
  ticket: number | null | undefined,
  name: string | null | undefined
): string {
  const who = name?.trim();
  return who ? `${ticketOf(ticket)} — ${who}` : ticketOf(ticket);
}
