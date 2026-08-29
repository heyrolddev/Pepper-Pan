import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/auth";

export type ChatSettings = {
  messengerUrl: string | null;
  pageId: string | null;
};

const EMPTY: ChatSettings = { messengerUrl: null, pageId: null };

/**
 * The shop's chat links, read for every page render.
 *
 * Returns empty rather than throwing when Supabase isn't configured or
 * migration 0011 hasn't been run yet — a missing Messenger link should cost
 * the site a button, not the whole layout.
 */
export async function getChatSettings(): Promise<ChatSettings> {
  if (!isConfigured()) return EMPTY;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("chat_settings")
      .select("messenger_url, page_id")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return EMPTY;
    return {
      messengerUrl: data.messenger_url ?? null,
      pageId: data.page_id ?? null,
    };
  } catch {
    return EMPTY;
  }
}
