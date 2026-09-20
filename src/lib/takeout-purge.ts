import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { TWIN } from "@/lib/takeout-merge";

/**
 * Deleting the "(T.O)" twins for good.
 *
 * The merge collapsed them into packaging and HID them, deliberately: their
 * `order_lines` are real sales at real prices, and hiding kept that history
 * while taking them off the menu. A year on they are still in every dish
 * picker in HQ, and the owner has asked for them gone.
 *
 * ── What this actually costs, which is not what it sounds like ───────────
 *
 * It sounds like deleting sales. It is not. Every peso lives on the ORDER —
 * `orders.revenue`, `.cogs`, `.gross_profit`, `.net_profit` are frozen there
 * at the moment of sale, and the cash pots are worked out from `orders` and
 * `cash_ledger`. None of that mentions a dish. So takings, profit, break-even,
 * payback and every figure on Costs & cash are untouched by this.
 *
 * What goes is the ITEMISATION: the lines saying order #412 contained one
 * "(T.O) Ji Pai". So a receipt reprinted for an old order shows a total with
 * fewer lines under it, and Analytics loses those dishes from its per-dish
 * counts. That is the trade, and it is worth stating plainly because the
 * obvious reading — "I am about to delete my sales" — is wrong.
 *
 * ── Why order lines have to go first ─────────────────────────────────────
 *
 * `order_lines.meal_id references meals(id)` with no `on delete` clause, so
 * PostgreSQL refuses to delete a dish that has ever been sold. That refusal
 * is a feature everywhere else in this system and the reason nothing has ever
 * quietly taken a dish's history with it. Here it is being overridden on
 * purpose, once, for a named set of dishes the owner has asked to be rid of.
 *
 * The other references all cascade already (`meal_ingredients`,
 * `meal_packaging`, `reviews`, and a combo's own component rows), so they need
 * no help. One does not, and it is the one that must not be forced:
 * `meal_components.component_meal_id`. A twin used INSIDE a combo that is
 * still sold cannot go, because deleting it would leave that combo unable to
 * price itself. Those are reported and skipped rather than dealt with.
 */

export type PurgeRow = {
  id: string;
  name: string;
  /** Lines in past orders that name this dish. Deleted with it. */
  orderLines: number;
  onMenu: boolean;
};

export type PurgePlan = {
  rows: PurgeRow[];
  /** Twins that cannot go, and the reason, in the owner's words. */
  blocked: string[];
  totalOrderLines: number;
  error: string | null;
};

const EMPTY: PurgePlan = { rows: [], blocked: [], totalOrderLines: 0, error: null };

/** What would happen, without changing anything. */
export async function planTakeoutPurge(): Promise<PurgePlan> {
  // Wrapped for the same reason the merge plan is: this is advisory panel on
  // the Menu screen, and the Menu screen is where prices get fixed
  // mid-service. It must never be the reason that page 500s.
  try {
    const db = createAdminClient();

    const { data: meals, error } = await db
      .from("meals")
      .select("id, name, is_public, is_available");
    if (error) throw new Error(error.message);

    const twins = ((meals ?? []) as {
      id: string;
      name: string;
      is_public: boolean;
      is_available: boolean;
    }[]).filter((m) => TWIN.test(m.name));

    if (twins.length === 0) return EMPTY;
    const ids = twins.map((t) => t.id);

    // Read both in one round trip each rather than per dish: this runs on
    // every load of the Menu screen.
    const [{ data: lines }, { data: components }] = await Promise.all([
      db.from("order_lines").select("meal_id").in("meal_id", ids),
      db.from("meal_components").select("component_meal_id").in("component_meal_id", ids),
    ]);

    const lineCount = new Map<string, number>();
    for (const l of (lines ?? []) as { meal_id: string }[]) {
      lineCount.set(l.meal_id, (lineCount.get(l.meal_id) ?? 0) + 1);
    }
    const insideACombo = new Set(
      ((components ?? []) as { component_meal_id: string }[]).map((c) => c.component_meal_id)
    );

    const rows: PurgeRow[] = [];
    const blocked: string[] = [];
    for (const t of twins) {
      if (insideACombo.has(t.id)) {
        blocked.push(`${t.name} — part of a combo that is still sold`);
        continue;
      }
      rows.push({
        id: t.id,
        name: t.name,
        orderLines: lineCount.get(t.id) ?? 0,
        onMenu: t.is_public,
      });
    }

    rows.sort((a, b) => a.name.localeCompare(b.name));
    return {
      rows,
      blocked,
      totalOrderLines: rows.reduce((n, r) => n + r.orderLines, 0),
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[takeout-purge] could not work out a plan: ${message}`);
    return { ...EMPTY, error: message };
  }
}

/**
 * Do it.
 *
 * Re-plans rather than trusting what the browser sends, so the thing deleted
 * is the thing the rule picks out — a list posted from a stale tab cannot
 * name a dish that has since been put back on the menu.
 */
export async function applyTakeoutPurge(): Promise<{
  deleted: number;
  lines: number;
  failed: string[];
  error: string | null;
}> {
  const plan = await planTakeoutPurge();
  if (plan.error) return { deleted: 0, lines: 0, failed: [], error: plan.error };
  if (plan.rows.length === 0) return { deleted: 0, lines: 0, failed: [], error: null };

  const db = createAdminClient();
  const failed: string[] = [];
  let deleted = 0;
  let lines = 0;

  for (const row of plan.rows) {
    // Lines first: the foreign key refuses the dish while any remain, and
    // doing it the other way round would fail on exactly the dishes that
    // matter most.
    if (row.orderLines > 0) {
      const { error } = await db.from("order_lines").delete().eq("meal_id", row.id);
      if (error) {
        failed.push(`${row.name}: ${error.message}`);
        continue;
      }
      lines += row.orderLines;
    }

    const { error } = await db.from("meals").delete().eq("id", row.id);
    if (error) {
      failed.push(`${row.name}: ${error.message}`);
      continue;
    }
    deleted++;
  }

  return { deleted, lines, failed, error: null };
}
