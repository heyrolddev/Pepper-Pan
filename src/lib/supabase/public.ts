import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Anonymous, and deliberately unaware of who is asking.
 *
 * The other server client reads cookies to find the signed-in session. That is
 * right for anything personal, and wrong for content that is the same for
 * everybody: touching `cookies()` marks the page as depending on the request,
 * which drops it out of static rendering and makes the shop's front door cost
 * a render and a round-trip per visitor.
 *
 * This one reads as `anon` with no session at all. Row Level Security still
 * applies in full — so a policy that returns only what is live still decides
 * what comes back — but nothing about the request varies, so a page built on
 * it can be cached and refreshed on a timer.
 *
 * Only for genuinely public reads. Anything that should differ per person is
 * exactly what this client cannot see.
 *
 * Returns null rather than throwing when the project isn't configured: the
 * homepage renders without a database, and it should keep doing that.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
