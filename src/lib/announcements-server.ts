import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Announcement } from "@/lib/announcements";

/**
 * What the homepage should show right now.
 *
 * Read as an anonymous visitor on purpose, through the client that does not
 * look at cookies. Two things follow from that, and both matter:
 *
 *  - The row policy already returns only what is live, so the window is
 *    enforced by the database on every read rather than by a filter here that
 *    a second caller could forget.
 *  - Nothing about the answer depends on who is asking, so the homepage stays
 *    statically rendered. Reading this through the cookie-aware client instead
 *    silently turns the shop's front door into a per-request render — it
 *    builds, it looks right, and every customer pays for it.
 *
 * Never throws. The homepage is the shop's front door: a promo that cannot be
 * loaded is a reason to show the default strip, not a reason to show nothing
 * — and certainly not a reason to 500 on a customer trying to find the menu.
 */
export async function getLiveAnnouncements(): Promise<{
  promos: Announcement[];
  news: Announcement[];
}> {
  try {
    const supabase = createPublicClient();
    // No project configured — the homepage still renders, on its own copy.
    if (!supabase) return { promos: [], news: [] };

    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("sort_order")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`[announcements] ${error.message}`);
      return { promos: [], news: [] };
    }

    const rows = (data ?? []) as Announcement[];
    return {
      promos: rows.filter((r) => r.kind === "promo"),
      // Newest first, and only a few: a homepage is not an archive, and the
      // fourth-oldest notice is not why anybody came.
      news: rows.filter((r) => r.kind === "news").slice(0, 3),
    };
  } catch (e) {
    console.error(`[announcements] ${e instanceof Error ? e.message : String(e)}`);
    return { promos: [], news: [] };
  }
}

/**
 * Everything, live or not, for the people who edit it.
 *
 * Through the service role: the manager needs to see drafts and finished
 * promos, and the public policy deliberately hides both. The capability check
 * is in the page and the actions — this function is only reachable from them.
 */
export async function getAllAnnouncements(): Promise<{
  rows: Announcement[];
  error: string | null;
}> {
  try {
    const { data, error } = await createAdminClient()
      .from("announcements")
      .select("*")
      .order("kind")
      .order("sort_order")
      .order("created_at", { ascending: false });

    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as Announcement[], error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}
