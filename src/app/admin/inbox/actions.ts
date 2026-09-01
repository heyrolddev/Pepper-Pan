"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can, getViewer } from "@/lib/auth";
import { deriveTriggers } from "@/lib/faq";

/**
 * Clear (or re-raise) a conversation.
 *
 * Written through the caller's own session, not the service role: RLS on
 * `chat_threads` only lets staff update, so a customer who found this action
 * couldn't mark their own thread handled and hide it from the shop.
 */
/**
 * These six leaned entirely on RLS and had no check of their own.
 *
 * For most of them that was harmless — the policy said `is_staff()` and so
 * does the capability. `saveChatSettings` was not: it writes the Facebook
 * page the shop's "Ask Pepper Pan" button opens, which is the same kind of
 * decision as the GCash number, and any shift could have changed it.
 *
 * Stated here as well as in the policy, because an action whose only guard is
 * a policy in another file is an action nobody remembers to guard when the
 * policy is edited.
 */
export async function setThreadHandled(
  threadId: string,
  handled: boolean
): Promise<{ error: string | null }> {
  if (!can(await getViewer(), "chat")) return { error: "Not allowed." };
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
  if (!can(await getViewer(), "settings")) return { error: "Only the owner can change where customers are sent to chat." };
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

/**
 * Reply to a customer as the shop.
 *
 * Written through the owner's own session, so the `staff_write_messages`
 * policy — which demands `is_staff()` *and* `role = 'staff'` — is what proves
 * this is really the shop talking. The first reply also takes the thread over,
 * which stops the automatic answers on it for good.
 */
export async function replyToThread(
  threadId: string,
  text: string
): Promise<{ error: string | null }> {
  if (!can(await getViewer(), "chat")) return { error: "Not allowed." };
  const body = text.trim();
  if (!body) return { error: "Type a reply first." };
  if (body.length > 2000) return { error: "That's too long for one message." };

  const supabase = await createClient();

  const { error: msgError } = await supabase.from("chat_messages").insert({
    thread_id: threadId,
    role: "staff",
    content: body,
  });

  if (msgError) {
    return {
      error: `${msgError.message}. If this mentions role or chat_messages, run migration 0012 in the Supabase SQL Editor.`,
    };
  }

  const { error: threadError } = await supabase
    .from("chat_threads")
    .update({
      taken_over: true,
      taken_over_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      // You've replied, so it's no longer waiting on you.
      needs_human: false,
    })
    .eq("id", threadId);

  if (threadError) return { error: threadError.message };

  revalidatePath("/admin/inbox");
  return { error: null };
}

/**
 * Turn a question the assistant fumbled into an answer it will always give.
 *
 * Triggers default to the meaningful words of the question itself, so the
 * owner can save a working answer without thinking about keywords — and edit
 * them later on the FAQ page if it fires too often or too rarely.
 */
export async function teachAnswer(input: {
  question: string;
  answer: string;
  triggers: string;
  threadId?: string;
}): Promise<{ error: string | null }> {
  if (!can(await getViewer(), "chat")) return { error: "Not allowed." };
  const question = input.question.trim().slice(0, 300);
  const answer = input.answer.trim().slice(0, 2000);
  if (!question) return { error: "What was the question?" };
  if (!answer) return { error: "Write the answer you'd give." };

  const triggers = deriveTriggers(input.triggers || question);
  if (triggers.length === 0) {
    return {
      error:
        "Add at least one word that should reach this answer — for example 'parking' or 'delivery'.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("faq_entries")
    .insert({ question, answer, triggers });

  if (error) {
    return {
      error: `${error.message}. If this mentions faq_entries, run migration 0012 in the Supabase SQL Editor.`,
    };
  }

  if (input.threadId) {
    await supabase
      .from("chat_threads")
      .update({ handled: true, handled_at: new Date().toISOString(), needs_human: false })
      .eq("id", input.threadId);
  }

  revalidatePath("/admin/faq");
  revalidatePath("/admin/inbox");
  return { error: null };
}

/** Update an existing answer — the "mali ang sagot" fix. */
export async function updateFaqEntry(input: {
  id: string;
  question: string;
  answer: string;
  triggers: string;
  isActive: boolean;
  priority: number;
}): Promise<{ error: string | null }> {
  if (!can(await getViewer(), "chat")) return { error: "Not allowed." };
  const question = input.question.trim().slice(0, 300);
  const answer = input.answer.trim().slice(0, 2000);
  if (!question || !answer) return { error: "A question and an answer are both needed." };

  const triggers = deriveTriggers(input.triggers);
  if (triggers.length === 0) {
    return { error: "Keep at least one trigger word, or this answer can never be reached." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("faq_entries")
    .update({
      question,
      answer,
      triggers,
      is_active: input.isActive,
      priority: Math.max(0, Math.min(99, Math.round(input.priority) || 0)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That answer couldn't be updated." };

  revalidatePath("/admin/faq");
  return { error: null };
}

export async function deleteFaqEntry(id: string): Promise<{ error: string | null }> {
  if (!can(await getViewer(), "chat")) return { error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.from("faq_entries").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/faq");
  return { error: null };
}
