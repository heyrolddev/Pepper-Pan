import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { type Branch } from "@/lib/branches";

/**
 * The places this shop sells from.
 *
 * Read with the admin client on purpose. The list of branches is not secret —
 * every member of staff needs the name of their own branch on screen, and the
 * owner needs all of them for the Branches tab — and reading it through a
 * browser session would put an RLS round trip in front of a two-row table on
 * every page that renders a scope label.
 *
 * What is scoped is the ROWS of every other table, not this list. Hiding the
 * existence of a branch from the person working at another one protects
 * nothing and makes "which branch am I looking at?" unanswerable.
 */
export async function listBranches(): Promise<Branch[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("branches")
      .select("id, name, is_main, trading_note, active")
      .order("is_main", { ascending: false })
      .order("name");

    if (error) {
      console.error(`[branches] list: ${error.message}`);
      return [];
    }

    return ((data ?? []) as Record<string, unknown>[]).map((b) => ({
      id: String(b.id),
      name: String(b.name),
      isMain: b.is_main === true,
      tradingNote: (b.trading_note as string | null) ?? null,
      active: b.active !== false,
    }));
  } catch {
    // An empty list is the honest answer when the table cannot be read, and
    // every caller already treats "no branches" as "nothing to choose".
    return [];
  }
}
