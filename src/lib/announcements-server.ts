import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasDetail, type Announcement } from "@/lib/announcements";

const EMPTY = { promos: [], news: [], dineIn: null, comingSoon: null };

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
  /** The gold band has room for one of each; these are the ones it shows. */
  dineIn: Announcement | null;
  comingSoon: Announcement | null;
}> {
  try {
    const supabase = createPublicClient();
    // No project configured — the homepage still renders, on its own copy.
    if (!supabase) return EMPTY;

    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("sort_order")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`[announcements] ${error.message}`);
      return EMPTY;
    }

    const rows = (data ?? []) as Announcement[];
    return {
      promos: rows.filter((r) => r.kind === "promo"),
      // Newest first, and only a few: a homepage is not an archive, and the
      // fourth-oldest notice is not why anybody came. The rest are on /news.
      news: rows.filter((r) => r.kind === "news").slice(0, 3),
      dineIn: rows.find((r) => r.kind === "dine_in") ?? null,
      comingSoon: rows.find((r) => r.kind === "coming_soon") ?? null,
    };
  } catch (e) {
    console.error(`[announcements] ${e instanceof Error ? e.message : String(e)}`);
    return EMPTY;
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

/**
 * Everything a customer may read, for the /news page.
 *
 * Same anonymous client as the homepage, so the same row policy decides it:
 * a scheduled promo is not merely left off the list, it cannot be fetched.
 */
export async function getPublicFeed(): Promise<{
  promos: Announcement[];
  news: Announcement[];
}> {
  const live = await getLiveAnnouncements();
  return {
    // Only promos with something to read. The strip lines are promo rows
    // because the scrolling strip is what they are for; as cards they were
    // four yellow boxes whose only content was "read more".
    promos: live.promos.filter(hasDetail),
    news: live.news,
  };
}

/**
 * One post, for its own page.
 *
 * Returns null for anything not live, which the page turns into a 404. That
 * is deliberate rather than an oversight: a promo that has finished should
 * not keep a working URL a customer can send to a friend as proof.
 */
export async function getAnnouncement(id: number): Promise<Announcement | null> {
  try {
    const supabase = createPublicClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error(`[announcements] ${error.message}`);
      return null;
    }
    return (data as Announcement | null) ?? null;
  } catch {
    return null;
  }
}
