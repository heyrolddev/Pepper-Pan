"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { askAssistant, type ChatTurn } from "@/lib/assistant";

const MAX_MESSAGE = 1000;

/**
 * One turn of "Ask Pepper Pan".
 *
 * Threads are written with the service-role client: an anonymous visitor has
 * no Supabase session to write under, and giving the public an INSERT policy
 * on a table the shop reads would be an open door for spam. The `guestKey` is
 * a random value the browser holds, so a signed-out person keeps their own
 * thread without the shop learning who they are.
 */
export async function sendChatMessage(input: {
  guestKey: string;
  message: string;
}): Promise<{ reply: string; needsHuman: boolean; error: string | null }> {
  const message = input.message.trim();
  if (!message) {
    return { reply: "", needsHuman: false, error: "Type a message first." };
  }
  if (message.length > MAX_MESSAGE) {
    return {
      reply: "",
      needsHuman: false,
      error: "That's a bit long — could you shorten it?",
    };
  }
  if (!/^[a-z0-9-]{8,64}$/i.test(input.guestKey)) {
    return { reply: "", needsHuman: false, error: "Chat session expired — please reload." };
  }

  // Attribute the thread to a signed-in customer when there is one, so the
  // shop can see who's asking without the visitor having to say.
  let customerId: string | null = null;
  try {
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    customerId = user?.id ?? null;
  } catch {
    /* signed out — the thread stays anonymous */
  }

  const db = createAdminClient();

  // Find or open this visitor's thread.
  const { data: existing } = await db
    .from("chat_threads")
    .select("id")
    .eq("guest_key", input.guestKey)
    .maybeSingle();

  let threadId = existing?.id as string | undefined;
  if (!threadId) {
    const { data: created, error } = await db
      .from("chat_threads")
      .insert({ guest_key: input.guestKey, customer_id: customerId, channel: "web" })
      .select("id")
      .single();
    if (error || !created) {
      return {
        reply: "",
        needsHuman: false,
        error:
          "Couldn't start the chat. If this keeps happening, run migration 0011 in the Supabase SQL Editor.",
      };
    }
    threadId = created.id;
  } else if (customerId) {
    // They signed in mid-conversation — attach the thread to them.
    await db.from("chat_threads").update({ customer_id: customerId }).eq("id", threadId);
  }

  // Replay the thread so the assistant has context, then add this turn.
  const { data: past } = await db
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("id", { ascending: true })
    .limit(40);

  const history: ChatTurn[] = [
    ...((past ?? []) as ChatTurn[]),
    { role: "user", content: message },
  ];

  await db.from("chat_messages").insert({
    thread_id: threadId,
    role: "user",
    content: message,
  });

  const reply = await askAssistant(history);

  await db.from("chat_messages").insert({
    thread_id: threadId,
    role: "assistant",
    content: reply.text,
  });

  await db
    .from("chat_threads")
    .update({
      last_message_at: new Date().toISOString(),
      // Sticky: once a thread needs a human it stays flagged until staff
      // mark it handled, so a later chatty turn can't bury a real lead.
      ...(reply.needsHuman ? { needs_human: true, handled: false } : {}),
    })
    .eq("id", threadId);

  revalidatePath("/admin/inbox");
  return { reply: reply.text, needsHuman: reply.needsHuman, error: null };
}

/** Attach a name and number to a thread, so the shop can call back. */
export async function saveChatContact(input: {
  guestKey: string;
  name: string;
  phone: string;
}): Promise<{ error: string | null }> {
  if (!/^[a-z0-9-]{8,64}$/i.test(input.guestKey)) {
    return { error: "Chat session expired — please reload." };
  }
  const name = input.name.trim().slice(0, 120);
  const phone = input.phone.trim().slice(0, 40);
  if (!name || phone.replace(/\D/g, "").length < 10) {
    return { error: "Please give a name and a working mobile number." };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("chat_threads")
    .update({ contact_name: name, contact_phone: phone, needs_human: true, handled: false })
    .eq("guest_key", input.guestKey)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Couldn't save that — please try again." };

  revalidatePath("/admin/inbox");
  return { error: null };
}
