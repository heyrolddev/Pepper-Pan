"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Clear (or re-raise) a conversation.
 *
 * Written through the caller's own session, not the service role: RLS on
 * `chat_threads` only lets staff update, so a customer who found this action
 * couldn't mark their own thread handled and hide it from the shop.
 */
export async function setThreadHandled(
  threadId: string,
  handled: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("chat_threads")
    .update({
      handled,
      handled_at: handled ? new Date().toISOString() : null,
      // Clearing a thread also clears the flag; re-opening one raises it again
      // so it comes back to the top of "Needs a reply".
      needs_human: !handled,
    })
    .eq("id", threadId)
    .select("id");

  if (error) {
    return {
      error: `${error.message}. If this mentions chat_threads, run migration 0011 in the Supabase SQL Editor.`,
    };
  }
  if (!data || data.length === 0) {
    return { error: "That conversation couldn't be updated." };
  }

  revalidatePath("/admin/inbox");
  return { error: null };
}

/** Save the shop's Messenger link, shown to visitors who need a person. */
export async function saveChatSettings(input: {
  messengerUrl: string;
  pageId: string;
}): Promise<{ error: string | null }> {
  const url = input.messengerUrl.trim();
  if (url && !/^https:\/\/(m\.me|www\.facebook\.com|facebook\.com)\//i.test(url)) {
    return {
      error: "Use your Messenger link — it starts with https://m.me/ or https://facebook.com/.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_settings")
    .update({
      messenger_url: url || null,
      page_id: input.pageId.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("id");

  if (error) {
    return {
      error: `${error.message}. If this mentions chat_settings, run migration 0011 in the Supabase SQL Editor.`,
    };
  }
  if (!data || data.length === 0) {
    return { error: "Couldn't save — run migration 0011, then try again." };
  }

  revalidatePath("/admin/inbox");
  return { error: null };
}
