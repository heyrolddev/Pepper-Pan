/**
 * The restore that happens on the day the project is gone.
 *
 * ── What a backup cannot carry ───────────────────────────────────────────
 *
 * `auth.users` belongs to Supabase, not to this schema. The backup does not
 * export it and could not: it holds password hashes and provider tokens that
 * are not ours to copy. So a backup put into a FRESH project — which is the
 * whole disaster this feature exists for — arrives carrying orders,
 * reviews, chats and shifts that all point at accounts which no longer
 * exist anywhere.
 *
 * Postgres refuses every one of those rows. And because PostgREST sends a
 * chunk as a single statement, one refused row takes the other four hundred
 * and ninety-nine travelling with it — and the restore then stopped at the
 * first failing chunk, so one order belonging to a deleted account lost
 * EVERY order, including the walk-ins that had no customer at all.
 *
 * That is the difference between "we lost the customer logins" and "we lost
 * every sale the shop has ever made", and nothing on the screen said which
 * had happened.
 *
 * ── What this does instead ───────────────────────────────────────────────
 *
 * An order whose customer no longer exists is still a sale that happened.
 * The money, the date, the lines, the ticket are all intact and all matter.
 * Losing the link to a deleted account is a far smaller loss than losing the
 * order, so the link is what gets dropped: the column is set to null and the
 * row goes in.
 *
 * Two columns cannot be nulled, because the row means nothing without them —
 * a profile IS an auth user, and a shift with no staff is not payroll
 * evidence. Those rows are held back and REPORTED BY NAME, so the owner
 * knows to recreate those accounts and import again rather than discovering
 * a gap in their payroll months later.
 *
 * Deliberately free of imports so `node --test` can read it directly.
 */

/**
 * Every restorable column that points at `auth.users`, and whether the row
 * survives without it.
 *
 * Written out rather than discovered from the schema, for the same reason
 * `backup.ts` lists its tables by hand: a column added later must be a
 * decision somebody makes, not something that silently starts being nulled.
 * `tests/restore-repair.test.ts` checks this list against the migrations and
 * fails when a new auth reference appears.
 */
export const AUTH_REFS: Record<string, { column: string; nullable: boolean }[]> = {
  // The sale is the record. Which account placed it is a detail beside that.
  orders: [{ column: "customer_id", nullable: true }],
  // What somebody said about the food stands on its own.
  reviews: [
    { column: "customer_id", nullable: true },
    { column: "relayed_by", nullable: true },
  ],
  chat_threads: [{ column: "customer_id", nullable: true }],
  // "Somebody did this" is still more than nothing.
  activity_log: [{ column: "actor", nullable: true }],
  promo_redemptions: [{ column: "customer_id", nullable: true }],
  // A profile IS an auth user. Without one there is no row to have.
  profiles: [
    { column: "id", nullable: false },
    { column: "role_offered_by", nullable: true },
  ],
  // A shift with nobody in it is not payroll evidence, it is a time range.
  staff_shifts: [{ column: "staff_id", nullable: false }],
};

export type Repair = {
  /** The rows that may be written. */
  rows: Record<string, unknown>[];
  /** Columns that had to be emptied, and how many times. */
  nulled: { column: string; count: number }[];
  /** Rows held back because the row cannot exist without the account. */
  heldBack: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every auth-user id the file refers to, deduplicated. */
export function collectAuthIds(data: Record<string, unknown[]> | undefined): string[] {
  const ids = new Set<string>();
  for (const [table, refs] of Object.entries(AUTH_REFS)) {
    const rows = data?.[table];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      for (const ref of refs) {
        const v = r[ref.column];
        if (typeof v === "string" && UUID.test(v)) ids.add(v.toLowerCase());
      }
    }
  }
  return [...ids];
}

/**
 * One table's rows, made safe to insert.
 *
 * `present` is the set of auth ids that actually exist in the database being
 * restored INTO — asked of that database, never assumed from the file. A
 * restore into the same project finds all of them and this does nothing at
 * all, which is the common case and must stay free.
 */
export function repairRows(
  table: string,
  rows: unknown[],
  present: Set<string>
): Repair {
  const refs = AUTH_REFS[table];
  if (!refs) {
    return { rows: rows as Record<string, unknown>[], nulled: [], heldBack: 0 };
  }

  const nulled = new Map<string, number>();
  const kept: Record<string, unknown>[] = [];
  let heldBack = 0;

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = { ...(raw as Record<string, unknown>) };
    let drop = false;

    for (const ref of refs) {
      const v = row[ref.column];
      // Already empty, or not an id at all — nothing to check.
      if (typeof v !== "string" || !UUID.test(v)) continue;
      if (present.has(v.toLowerCase())) continue;

      if (ref.nullable) {
        row[ref.column] = null;
        nulled.set(ref.column, (nulled.get(ref.column) ?? 0) + 1);
      } else {
        drop = true;
      }
    }

    if (drop) heldBack += 1;
    else kept.push(row);
  }

  return {
    rows: kept,
    nulled: [...nulled].map(([column, count]) => ({ column, count })),
    heldBack,
  };
}

/**
 * What to tell the owner, in the words that make the next move obvious.
 *
 * A restore reports "profiles: 40 of 62" and the owner has no idea whether
 * that is fine. It is not fine and it is not fatal, and which of those it is
 * depends entirely on the column — so the sentence says the column, the
 * count, and what to do about it.
 */
export function repairNote(table: string, repair: Repair): string | null {
  const bits: string[] = [];
  for (const n of repair.nulled) {
    bits.push(
      `${n.count} row${n.count === 1 ? "" : "s"} kept without their ${n.column} — those accounts no longer exist, the records themselves are intact`
    );
  }
  if (repair.heldBack > 0) {
    bits.push(
      `${repair.heldBack} row${repair.heldBack === 1 ? "" : "s"} held back: ${
        table === "staff_shifts"
          ? "a shift needs the staff account to exist. Re-invite those people, then import this file again and the shifts will land"
          : "this row cannot exist without its login. Re-create those accounts, then import again"
      }`
    );
  }
  return bits.length > 0 ? bits.join(". ") + "." : null;
}
