import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { askAssistant, type ChatTurn } from "@/lib/assistant";
import { notifyNeedsHuman } from "@/lib/notify";
import { MAX_MESSAGE, replay } from "@/lib/chat-history";

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
    /* `mid` is Meta's own id for this message, and it is the only thing
       that tells a retry apart from a second question. */
    message?: { mid?: string; text?: string; is_echo?: boolean };
  }[];
};

/**
 * Whether this message is ours to answer, or one Meta is sending again.
 *
 * Meta re-sends any delivery it does not get a prompt 200 for, and this
 * webhook does its whole job before acknowledging: four round trips to the
 * database and one to Facebook's Graph API, which has an eight second
 * timeout of its own. One slow send, one cold start, and the same message
 * arrives twice — and nothing stopped the second run putting the customer's
 * line in the inbox again, sending them a second identical reply, and
 * firing the owner's push notification twice.
 *
 * The insert IS the claim, which is the same trick `apply_order_stock` uses
 * for a sale: the primary key decides, atomically, and there is no window
 * between checking and claiming for a retry to slip through. Two deliveries
 * racing cannot both win.
 *
 * A message with no `mid` is answered rather than dropped — that would be
 * Meta changing its payload, and going quiet at a customer is a worse
 * failure than answering one twice.
 */
async function claim(
  db: ReturnType<typeof createAdminClient>,
  mid: string | undefined,
  senderId: string
): Promise<boolean> {
  if (!mid) return true;
  const { error } = await db
    .from("messenger_events")
    .insert({ mid, sender_id: senderId });
  if (!error) return true;

  // 23505 is the unique violation: somebody already has this one.
  if (error.code === "23505") return false;

  // Any other failure — the table missing because 0070 has not been run,
  // a dropped connection — must not silence the shop. Answering twice is
  // recoverable; never answering is a customer who thinks nobody is there.
  console.error(`[messenger] could not claim ${mid}: ${error.message}`);
  return true;
}

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

      // Before the model, before the writes, before anything that takes
      // time — because the time is what makes Meta send it again.
      if (!(await claim(db, event.message?.mid, senderId))) continue;

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

      /* The LAST forty lines, not the first forty.
      
         This asked for `ascending: true` with a limit, which is the OLDEST
         forty — so past forty messages a conversation fed the model the
         same opening every time and never saw what had just been said. The
         customer repeats themselves and the assistant repeats itself, and
         from outside it looks like the assistant is simply stupid.
      
         Read newest-first so the limit takes the recent end, then turned
         back the right way round, because a model reads a conversation
         forwards. */
      const { data: past } = await db
        .from("chat_messages")
        .select("role, content")
        .eq("thread_id", threadId)
        .order("id", { ascending: false })
        .limit(40);

      const history: ChatTurn[] = replay((past ?? []) as ChatTurn[], text);

      await db.from("chat_messages").insert({
        thread_id: threadId,
        role: "user",
        content: text.slice(0, MAX_MESSAGE),
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

      // Same handoff, same push. A Messenger question the assistant could
      // not answer is exactly as urgent as one from the website, and it is
      // the channel most likely to be read hours late.
      if (reply.needsHuman && threadId) {
        await notifyNeedsHuman({ threadId, question: text ?? "" });
      }

      await sendToMessenger(senderId, reply.text);
    }
  }

  /* A page running a year should not carry a year of message ids. Done
     here rather than on a schedule so there is no cron to forget, and not
     awaited for its result — a failed tidy-up is not worth a retry of the
     whole delivery. */
  void db.rpc("prune_messenger_events").then(({ error }) => {
    if (error) console.error(`[messenger] prune: ${error.message}`);
  });

  // Meta retries anything that isn't a prompt 200, which would replay the
  // whole conversation — so acknowledge even when a message was skipped.
  return NextResponse.json({ ok: true });
}
