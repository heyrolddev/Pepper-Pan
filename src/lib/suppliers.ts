/**
 * Who the shop buys from.
 *
 * `purchase_log.supplier` has been free text since the beginning, which meant
 * the name was retyped at every delivery. Three deliveries from one person
 * become "Aling Nena", "aling nena" and "Nena", and from then on nothing that
 * groups by supplier can answer a question about her — not what the shop buys
 * there, not how much it has spent, not how to ring her when the chicken
 * hasn't arrived.
 *
 * The free-text column stays. It is what was written at the time, and
 * rewriting old rows to match a table invented later would be a lie about
 * what the record said. New deliveries carry `supplier_id` as well.
 */

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  place: string | null;
  /** What the shop buys here, in the owner's own words. */
  sells: string | null;
  note: string | null;
  active: boolean;
};

/**
 * A phone number as somebody would dial it.
 *
 * Kept deliberately loose: a supplier's number might be a mobile, a landline,
 * or "0917 555 1234 / ask for Nena". Refusing anything that isn't eleven
 * digits would mean the number nobody could save is the one actually written
 * on the delivery receipt.
 */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

/** What to show in the chip row at the till, most useful first. */
export function chipOrder(suppliers: Supplier[], recent: string[]): Supplier[] {
  const rank = new Map(recent.map((id, i) => [id, i]));
  return [...suppliers]
    .filter((s) => s.active)
    .sort((a, b) => {
      // Recently used first — a shop buys from the same three people most
      // weeks, and alphabetical order puts the one they use daily in the
      // middle of a list they have to read.
      const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
}
