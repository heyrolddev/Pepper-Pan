import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { DEFAULT_FAQS, type SiteFaq } from "@/lib/faq-site";

/**
 * The homepage's questions, from the shop's own answers.
 *
 * Read anonymously and without cookies, for the same two reasons as the
 * promos: the row policy decides what is public, and the homepage stays
 * statically rendered instead of costing a request per visitor.
 *
 * Never throws, and falls back to the standing five. An FAQ section that
 * disappears because a query failed reads as a broken page.
 */
export async function getSiteFaqs(): Promise<SiteFaq[]> {
  try {
    const supabase = createPublicClient();
    if (!supabase) return DEFAULT_FAQS;

    const { data, error } = await supabase
      .from("faq_entries")
      .select("question, answer")
      .eq("show_on_site", true)
      .eq("is_active", true)
      .order("site_order")
      .limit(12);

    if (error) {
      console.error(`[faq] ${error.message}`);
      return DEFAULT_FAQS;
    }
    const rows = (data ?? []) as SiteFaq[];
    return rows.length > 0 ? rows : DEFAULT_FAQS;
  } catch (e) {
    console.error(`[faq] ${e instanceof Error ? e.message : String(e)}`);
    return DEFAULT_FAQS;
  }
}
