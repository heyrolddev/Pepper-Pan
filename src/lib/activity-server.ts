import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Activity } from "@/lib/activity";

// Re-exported so a server caller needs one import, not two.
export type { Activity };
export { ACTIVITY_CATEGORIES, CATEGORY_LABEL } from "@/lib/activity";

/**
 * What the shop has been doing.
 *
 * `activity_log` has been written to from a dozen places since the first
 * migration — a restock, a price change, a shift clocking in, an order
 * cancelled, money moved — and until now nothing ever read it. So every one
 * of those sentences was being carefully composed and then filed where nobody
 * could see it.
 *
 * One reader, here, because two would drift: the batch history and the
 * History tab are the same question asked with a different filter, and the
 * day one of them learns to resolve a name the other would not.
 *
 * Names are resolved with a second query rather than a PostgREST embed.
 * `activity_log.actor` references `auth.users`, not `profiles`, so there is
 * no relationship for an embed to follow — it would return nulls that look
 * exactly like "nobody was signed in".
 */

export async function loadActivity(opts?: {
  /** "YYYY-MM-DD". Both ends inclusive. */
  from?: string;
  to?: string;
  category?: string;
  /**
   * Only lines mentioning this exact phrase.
   *
   * Used by a batch's own history: every log line that names a batch wraps
   * the name in curly quotes, so the quoted form matches "Sauce" without also
   * matching "Sauce Base".
   */
  mentions?: string;
  limit?: number;
}): Promise<{ rows: Activity[]; error: string | null }> {
  const supabase = createAdminClient();

  let q = supabase
    .from("activity_log")
    .select("id, at, date, category, description, actor")
    .order("at", { ascending: false })
    .limit(opts?.limit ?? 300);

  if (opts?.from) q = q.gte("date", opts.from);
  if (opts?.to) q = q.lte("date", opts.to);
  if (opts?.category) q = q.eq("category", opts.category);
  if (opts?.mentions) {
    // `%` and `_` are wildcards to ILIKE, and a batch may well be called
    // "50% cream". Escaped, or the filter quietly matches far too much.
    const safe = opts.mentions.replace(/[\\%_]/g, (c) => `\\${c}`);
    q = q.ilike("description", `%“${safe}”%`);
  }

  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []) as {
    id: string;
    at: string;
    date: string;
    category: string | null;
    description: string;
    actor: string | null;
  }[];

  const ids = [...new Set(rows.map((r) => r.actor).filter(Boolean))] as string[];
  const name = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const p of (people ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name?.trim()) name.set(p.id, p.full_name.trim());
    }
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      at: r.at,
      date: r.date,
      category: r.category,
      description: r.description,
      // A line with no actor is the system itself — an ETA running out, a
      // stale shift tidied away. Shown as nothing rather than as "unknown",
      // which would read like a person nobody can identify.
      who: r.actor ? (name.get(r.actor) ?? null) : null,
    })),
    error: null,
  };
}
