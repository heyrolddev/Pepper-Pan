import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Turning the "(T.O) X" duplicates into packaging on "X".
 *
 * This started life as a command-line script, which meant the one person who
 * needs to run it — the owner of a food stall — would have had to install
 * Node, make a file containing their database's service-role key, and type a
 * command. For a job done once, that is not a reasonable ask, and a key
 * copied into a file to run a script once is a key that stays in that file.
 *
 * So it lives here instead, behind a screen: look at the plan, then apply it.
 * One implementation rather than two — the same delicate operation written
 * twice will drift, and the copy that drifts is the one nobody runs until the
 * day they do.
 *
 * Nothing is deleted. Historical `order_lines` point at the twins and those
 * sales really happened at those prices; hiding takes them off the menu and
 * out of the till while leaving the history intact.
 */

const TWIN = /^\(\s*T\.?\s*O\.?\s*\)/i;
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const stripPrefix = (s: string) => s.replace(/^\(\s*T\.?\s*O\.?\s*\)\s*/i, "");

export type MergeLine = { refType: "inv" | "batch"; refId: string; qty: number; label: string };
export type MergeRow = {
  baseId: string;
  baseName: string;
  twinId: string;
  twinName: string;
  packaging: MergeLine[];
};
export type MergePlan = {
  rows: MergeRow[];
  skipped: string[];
  /** Dishes on the menu now, and how many would be left after. */
  before: number;
  after: number;
  error: string | null;
};

/**
 * Work out what would happen, without changing anything.
 *
 * Read by both the preview and the apply, so the thing shown is the thing
 * done — an apply that recomputes its own plan differently is an apply that
 * does something the owner never saw.
 */
export async function planTakeoutMerge(): Promise<MergePlan> {
  const db = createAdminClient();
  const empty = { rows: [], skipped: [], before: 0, after: 0 };

  const [meals, lines, ing, bat] = await Promise.all([
    db.from("meals").select("id, name, is_public, is_available"),
    db.from("meal_ingredients").select("meal_id, ref_type, ref_id, qty"),
    db.from("ingredients").select("id, name"),
    db.from("batches").select("id, name"),
  ]);
  if (meals.error || lines.error) {
    return { ...empty, error: (meals.error ?? lines.error)!.message };
  }

  type Meal = { id: string; name: string; is_public: boolean; is_available: boolean };
  type Line = { meal_id: string; ref_type: string; ref_id: string; qty: number };
  const allMeals = (meals.data ?? []) as Meal[];
  const allLines = (lines.data ?? []) as Line[];

  const label = new Map<string, string>([
    ...((ing.data ?? []) as { id: string; name: string }[]).map(
      (r) => [`inv:${r.id}`, r.name] as [string, string]
    ),
    ...((bat.data ?? []) as { id: string; name: string }[]).map(
      (r) => [`batch:${r.id}`, `${r.name} (batch)`] as [string, string]
    ),
  ]);

  const linesFor = new Map<string, Line[]>();
  for (const l of allLines) {
    const list = linesFor.get(l.meal_id) ?? [];
    list.push(l);
    linesFor.set(l.meal_id, list);
  }

  // A dine-in dish may share its name with another. Matching on a name that
  // isn't unique would attach one dish's packaging to a different dish, so
  // those are reported and skipped rather than guessed at.
  const byName = new Map<string, Meal | null>();
  for (const m of allMeals.filter((m) => !TWIN.test(m.name))) {
    const k = norm(m.name);
    byName.set(k, byName.has(k) ? null : m);
  }

  const rows: MergeRow[] = [];
  const skipped: string[] = [];

  // Twins that have already been collapsed are hidden — which is exactly the
  // state this leaves them in — so they must not be offered again, or the
  // panel would go on proposing the same job forever and never take itself
  // off the screen. (A "(T.O)" dish hidden for some other reason is off the
  // menu anyway, so there is nothing to collapse there either.)
  const pending = allMeals.filter(
    (m) => TWIN.test(m.name) && (m.is_public || m.is_available)
  );

  for (const twin of pending) {
    const base = byName.get(norm(stripPrefix(twin.name)));
    if (base === undefined) {
      skipped.push(`${twin.name} — no dine-in dish of that name`);
      continue;
    }
    if (base === null) {
      skipped.push(`${twin.name} — more than one dish shares that name`);
      continue;
    }

    const baseQty = new Map(
      (linesFor.get(base.id) ?? []).map((l) => [
        `${l.ref_type}:${l.ref_id}`,
        Number(l.qty) || 0,
      ])
    );
    const packaging: MergeLine[] = [];
    for (const l of linesFor.get(twin.id) ?? []) {
      const k = `${l.ref_type}:${l.ref_id}`;
      // Only the EXCESS counts as packaging. A take-out portion that also
      // uses more of an ingredient keeps the difference, not the whole line.
      const extra = (Number(l.qty) || 0) - (baseQty.get(k) ?? 0);
      if (extra > 0.00001) {
        packaging.push({
          refType: l.ref_type as "inv" | "batch",
          refId: l.ref_id,
          qty: extra,
          label: label.get(k) ?? "(deleted item)",
        });
      }
    }
    if (packaging.length === 0) {
      skipped.push(`${twin.name} — identical to ${base.name}, nothing to move`);
      continue;
    }
    rows.push({
      baseId: base.id,
      baseName: base.name,
      twinId: twin.id,
      twinName: twin.name,
      packaging,
    });
  }

  const onMenu = allMeals.filter((m) => m.is_public).length;
  return {
    rows,
    skipped,
    before: onMenu,
    after: onMenu - rows.filter((r) => allMeals.find((m) => m.id === r.twinId)?.is_public).length,
    error: null,
  };
}

/**
 * Do it.
 *
 * Replaces each dish's packaging rather than appending, so running this twice
 * cannot double the packaging on every dish — the owner pressing the button
 * again because they weren't sure it worked is the likeliest way this gets
 * run twice, and it must be safe.
 */
export async function applyTakeoutMerge(): Promise<{
  done: number;
  failed: string[];
  error: string | null;
}> {
  const plan = await planTakeoutMerge();
  if (plan.error) return { done: 0, failed: [], error: plan.error };

  const db = createAdminClient();
  const failed: string[] = [];
  let done = 0;

  for (const r of plan.rows) {
    const { error: delErr } = await db
      .from("meal_packaging")
      .delete()
      .eq("meal_id", r.baseId);
    if (delErr) {
      failed.push(`${r.baseName}: ${delErr.message}`);
      continue;
    }

    const { error: insErr } = await db.from("meal_packaging").insert(
      r.packaging.map((l) => ({
        meal_id: r.baseId,
        ref_type: l.refType,
        ref_id: l.refId,
        qty: l.qty,
      }))
    );
    if (insErr) {
      failed.push(`${r.baseName}: ${insErr.message}`);
      continue;
    }

    // Hidden, never deleted. `order_lines` still point here.
    const { error: hideErr } = await db
      .from("meals")
      .update({ is_public: false, is_available: false })
      .eq("id", r.twinId);
    if (hideErr) {
      failed.push(`hiding ${r.twinName}: ${hideErr.message}`);
      continue;
    }
    done++;
  }

  return { done, failed, error: null };
}
