"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCode, type PromoKind, type PromoScope } from "@/lib/promos";

/**
 * A line in the shop's own history.
 *
 * Never fatal. Losing the log line is bad; losing the change it describes
 * because the log line failed is worse — and a discount that silently did
 * not save is the version of that which costs money.
 */
async function log(category: string, description: string, actorId: string | null) {
  const db = createAdminClient();
  const { error } = await db
    .from("activity_log")
    .insert({ category, description, actor: actorId });
  if (error) console.error(`[promos] log: ${error.message}`);
}

type Result = { error: string | null };
const DENIED = "Only the owner can change discounts.";

export type PromoInput = {
  /** Absent for a new one. */
  id?: string;
  /** Blank for a counter-only discount nobody types. */
  code: string;
  label: string;
  description?: string;
  kind: PromoKind;
  value: number;
  scope: PromoScope;
  mealId?: string | null;
  minSpend?: number;
  maxDiscount?: number | null;
  maxUses?: number | null;
  maxPerCustomer?: number | null;
  startsOn?: string | null;
  endsOn?: string | null;
  online: boolean;
  atCounter: boolean;
  isActive: boolean;
};

/**
 * Creating or changing a discount.
 *
 * Owner only, and checked here rather than only in the UI: this is the one
 * form in the system whose output gives food away, and hiding a button is
 * not a permission — a fetch reaches the action all the same.
 *
 * Every refusal below is a rule the database ALSO holds (0064). Both, on
 * purpose: the constraint is what makes it true, and this is what makes it
 * explicable. A check violation surfacing as a Postgres error string is a
 * dead end for an owner who mistyped a percent.
 */
export async function savePromo(input: PromoInput): Promise<Result & { id?: string }> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) return { error: DENIED };

  const label = input.label.trim();
  if (!label) return { error: "Give it a name — it is what the customer sees." };

  const code = normalizeCode(input.code);
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: "How much off? Give a number above zero." };
  }
  if (input.kind === "percent" && value > 100) {
    // Over 100% the shop would be paying people to eat here.
    return { error: "A percentage off cannot be more than 100." };
  }
  if (input.scope === "meal" && !input.mealId) {
    /* A dish promo with no dish applies to nothing and would never fire —
       the worst failure a promo can have, because the shop advertises it
       and then argues with a customer at the counter. */
    return { error: "Which dish is it for?" };
  }
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    return { error: "It ends before it starts." };
  }
  if (!input.online && !input.atCounter) {
    // Otherwise it exists and can be used nowhere, which reads as broken.
    return { error: "Allow it online, at the counter, or both." };
  }
  if (!code && input.online) {
    /* Online there is nothing to pick from — the customer types a code or
       there is no way to ask for it at all. */
    return { error: "An online promo needs a code for customers to type." };
  }

  const db = createAdminClient();
  const row = {
    code: code || null,
    label,
    description: input.description?.trim() || null,
    kind: input.kind,
    value,
    scope: input.scope,
    meal_id: input.scope === "meal" ? input.mealId : null,
    min_spend: Math.max(0, Number(input.minSpend) || 0),
    max_discount:
      input.kind === "percent" && Number(input.maxDiscount) > 0
        ? Number(input.maxDiscount)
        : null,
    max_uses: Number(input.maxUses) > 0 ? Math.round(Number(input.maxUses)) : null,
    max_per_customer:
      Number(input.maxPerCustomer) > 0
        ? Math.round(Number(input.maxPerCustomer))
        : null,
    starts_on: input.startsOn || null,
    ends_on: input.endsOn || null,
    online: input.online,
    at_counter: input.atCounter,
    is_active: input.isActive,
  };

  if (input.id) {
    /* `.select("id")` and a row count, because an UPDATE matching nothing is
       a success in PostgREST — the dialog would close, the promo would keep
       its old terms, and nothing anywhere would say why. */
    const { data, error } = await db
      .from("promos")
      .update(row)
      .eq("id", input.id)
      .select("id");
    if (error) return { error: friendly(error.message) };
    if (!data || data.length === 0) {
      return { error: "That promo no longer exists — it may have been deleted." };
    }
    await log("money", `Changed the promo "${label}"`, viewer?.profile?.id ?? null);
    revalidatePath("/admin/promos");
    return { error: null, id: input.id };
  }

  const { data, error } = await db
    .from("promos")
    .insert({ ...row, created_by: viewer?.profile?.id ?? null })
    .select("id")
    .single();
  if (error || !data) return { error: friendly(error?.message ?? "Could not save it.") };

  await log(
    // Money, not menu: creating a discount is a decision that costs pesos,
    // and it belongs in the history beside the other ones that do.
    "money",
    `New promo "${label}"${code ? ` (${code})` : ""}`,
    viewer?.profile?.id ?? null
  );
  revalidatePath("/admin/promos");
  return { error: null, id: data.id as string };
}

/** The one database error an owner can actually cause, said in words. */
function friendly(message: string): string {
  if (/promos_code_key|duplicate key/i.test(message)) {
    return "There is already a promo with that code.";
  }
  return message;
}

/**
 * Switching one off.
 *
 * The usual way to end a promo, and the one that keeps history: every order
 * that used it still points at it, so the report of what it cost survives.
 */
export async function setPromoActive(id: string, on: boolean): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) return { error: DENIED };

  const db = createAdminClient();
  const { error } = await db.from("promos").update({ is_active: on }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/promos");
  return { error: null };
}

/**
 * Deleting one for good.
 *
 * Its redemptions go with it — they are rows about a promo that no longer
 * exists. The ORDERS do not: each keeps `promo_code` and `discount` as text
 * and pesos, so a receipt from last month stays explicable after the promo
 * behind it is gone. That is why those two columns are copies rather than a
 * foreign key.
 */
export async function deletePromo(id: string): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) return { error: DENIED };

  const db = createAdminClient();
  const { data } = await db.from("promos").select("label").eq("id", id).maybeSingle();
  const { error } = await db.from("promos").delete().eq("id", id);
  if (error) return { error: error.message };

  await log(
    // Money, not menu: creating a discount is a decision that costs pesos,
    // and it belongs in the history beside the other ones that do.
    "money",
    `Deleted the promo "${data?.label ?? id}"`,
    viewer?.profile?.id ?? null
  );
  revalidatePath("/admin/promos");
  return { error: null };
}
