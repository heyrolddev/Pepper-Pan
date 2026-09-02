import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasDetail, homepagePicks, type Announcement } from "@/lib/announcements";

const EMPTY = { promos: [], promoCards: [], news: [], dineIn: null, comingSoon: null };

/**
 * Every row a visitor is allowed to see, which the policy has already narrowed
 * to what is live right now.
 *
 * Shared by the homepage and by /news so the two can never disagree about
 * what is running — they differ in how much they show, not in what exists.
 */
async function readLive(): Promise<Announcement[]> {
  const supabase = createPublicClient();
  // No project configured — the homepage still renders, on its own copy.
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("sort_order")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`[announcements] ${error.message}`);
    return [];
  }
  return (data ?? []) as Announcement[];
}

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
  /** Every live promo — the scrolling strip shows them all. */
  promos: Announcement[];
  /** The two that get a card. */
  promoCards: Announcement[];
  /** The three on the homepage: pinned first, then newest. */
  news: Announcement[];
  /** The gold band has room for one of each; these are the ones it shows. */
  dineIn: Announcement | null;
  comingSoon: Announcement | null;
}> {
  try {
    // Ordered by the query only so the strip is stable. WHAT the homepage
    // shows is decided by homepagePicks, because each kind has a different
    // idea of "first" — asking the database for one order and then slicing it
    // three deep is precisely how the newest news post became unreachable.
    const rows = await readLive();
    return {
      promos: rows.filter((r) => r.kind === "promo"),
      promoCards: homepagePicks(rows, "promo"),
      // A homepage is not an archive; the rest are on /news.
      news: homepagePicks(rows, "news"),
      dineIn: homepagePicks(rows, "dine_in")[0] ?? null,
      comingSoon: homepagePicks(rows, "coming_soon")[0] ?? null,
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
  try {
    const rows = await readLive();
    return {
      // Everything running, not only what fits on the homepage — this is the
      // page the homepage links to precisely when there is more.
      //
      // Promos still have to say something beyond their title: the strip
      // lines are promo rows, and as cards they were yellow boxes whose only
      // content was the words "read more".
      promos: rows.filter((r) => r.kind === "promo" && hasDetail(r)),
      news: rows
        .filter((r) => r.kind === "news")
        .sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    };
  } catch (e) {
    console.error(`[announcements] ${e instanceof Error ? e.message : String(e)}`);
    return { promos: [], news: [] };
  }
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
