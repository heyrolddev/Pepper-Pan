import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { askAssistant, type ChatTurn } from "@/lib/assistant";

/**
 * Facebook Messenger webhook — "Ask Pepper Pan" on the shop's Page.
 *
 * Someone messages the Page, Meta POSTs here, the same assistant that answers
 * on the website replies, and the conversation lands in the shop's inbox
 * alongside the web ones. When the assistant decides a person is needed the
 * thread is flagged, so the owner sees the lead in HQ rather than having to
 * scroll Messenger.
 *
 * Setup on Meta's side (nothing here needs changing):
 *   MESSENGER_VERIFY_TOKEN  — any string; paste the same one into Meta
 *   MESSENGER_PAGE_TOKEN    — the Page access token
 *   MESSENGER_APP_SECRET    — used to verify each request really came from Meta
 */

export const dynamic = "force-dynamic";

/** Meta's one-time subscription handshake. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.MESSENGER_VERIFY_TOKEN;
  if (!expected) {
    return new NextResponse("Messenger is not configured.", { status: 503 });
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Meta signs every delivery. Without this check the endpoint is a public
 * "make the shop's AI answer anything" button, and anyone could stuff the
 * owner's inbox with threads that never happened.
 */
function signatureValid(raw: string, header: string | null): boolean {
  const secret = process.env.MESSENGER_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const sent = header.slice("sha256=".length);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sent, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type Entry = {
  messaging?: {
    sender?: { id?: string };
    message?: { text?: string; is_echo?: boolean };
  }[];
};

async function sendToMessenger(recipientId: string, text: string) {
  const token = process.env.MESSENGER_PAGE_TOKEN;
  if (!token) return;
  try {
    await fetch(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: { text: text.slice(0, 1900) },
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
  } catch {
    // A failed send still leaves the message in the shop's inbox, which is
    // the outcome that actually matters — the owner can reply by hand.
  }
}

export async function POST(request: Request) {
  const raw = await request.text();

  if (!signatureValid(raw, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let body: { object?: string; entry?: Entry[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (body.object !== "page") return NextResponse.json({ ok: true });

  const db = createAdminClient();

  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const text = event.message?.text?.trim();
      // Echoes are the Page's own outgoing messages coming back.
      if (!senderId || !text || event.message?.is_echo) continue;

      const { data: existing } = await db
        .from("chat_threads")
        .select("id")
        .eq("external_id", senderId)
        .maybeSingle();

      let threadId = existing?.id as string | undefined;
      if (!threadId) {
        const { data: created } = await db
          .from("chat_threads")
          .insert({ external_id: senderId, channel: "messenger" })
          .select("id")
          .single();
        if (!created) continue;
        threadId = created.id;
      }

      const { data: past } = await db
        .from("chat_messages")
        .select("role, content")
        .eq("thread_id", threadId)
        .order("id", { ascending: true })
        .limit(40);

      const history: ChatTurn[] = [
        ...((past ?? []) as ChatTurn[]),
        { role: "user", content: text.slice(0, 1000) },
      ];

      await db.from("chat_messages").insert({
        thread_id: threadId,
        role: "user",
        content: text.slice(0, 1000),
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
          ...(reply.needsHuman ? { needs_human: true, handled: false } : {}),
        })
        .eq("id", threadId);

      await sendToMessenger(senderId, reply.text);
    }
  }

  // Meta retries anything that isn't a prompt 200, which would replay the
  // whole conversation — so acknowledge even when a message was skipped.
  return NextResponse.json({ ok: true });
}
