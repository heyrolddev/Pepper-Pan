import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export function assistantConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Facts the assistant is allowed to state, read fresh from the database.
 *
 * Everything the assistant says about the menu, prices, delivery and payment
 * comes from here — it is never asked to recall them. That's what stops it
 * inventing a dish or quoting a price the shop doesn't charge.
 */
async function shopFacts(): Promise<string> {
  const supabase = createAdminClient();

  const [meals, delivery, payments] = await Promise.all([
    supabase
      .from("meals")
      .select("name, price, description, categories")
      .eq("is_public", true)
      .eq("is_available", true)
      .order("name")
      .limit(200),
    supabase.from("delivery_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("payment_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  const menuLines = (meals.data ?? [])
    .map(
      (m) =>
        `- ${m.name} — ₱${Number(m.price).toFixed(2)}${
          m.description ? ` (${m.description})` : ""
        }`
    )
    .join("\n");

  const d = delivery.data;
  const p = payments.data;

  const deliveryText = d
    ? d.is_enabled
      ? `Delivery is available. Fee: ₱${d.base_fee} covers the first ${d.base_km} km, then ₱${d.per_km_fee} per extra km (minimum ₱${d.min_fee}). We don't deliver beyond ${d.max_km} km.${
          Number(d.free_over) > 0 ? ` Free delivery on orders over ₱${d.free_over}.` : ""
        }`
      : "Delivery is paused right now — pickup only."
    : "Delivery details aren't configured yet.";

  const paymentText = p
    ? [
        p.cod_enabled ? "Cash on delivery or at the stall." : null,
        p.gcash_enabled
          ? `GCash${p.gcash_number ? ` (${p.gcash_number}${p.gcash_name ? `, ${p.gcash_name}` : ""})` : ""}.${
              p.downpayment_enabled
                ? ` A ${p.downpayment_percent}% down payment is allowed, with the balance in cash on handover.`
                : ""
            }`
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "Payment details aren't configured yet.";

  return [
    "MENU (only these items exist):",
    menuLines || "(the menu is empty right now)",
    "",
    `DELIVERY: ${deliveryText}`,
    `PAYMENT: ${paymentText}`,
    "SHOP: Pepper Pan, Taiwan-style street food in Apalit, Pampanga.",
    "Located in front of Palengkeni, beside Osave. Phone +63 947 353 3060.",
    "TikTok @pepper.pan.taiwan.",
  ].join("\n");
}

const SYSTEM = `You are the assistant for Pepper Pan, a small Taiwan-style street food shop in Apalit, Pampanga, run by a family.

You help people decide what to order and answer questions about the menu, prices, delivery and payment.

Rules that matter:
- Only ever state facts from the SHOP FACTS below. If someone asks about a dish, a price, a delivery fee or an area not covered there, say you're not sure and offer to have the owner reply. Never invent a menu item, a price, or a promo.
- Never promise a discount, a freebie, or a delivery time. Only the owner can.
- You cannot see anyone's order status, take payment, or place an order. Point them to the Menu page to order, or to My Orders to track one.
- Keep replies short — two or three sentences. This is a chat, usually on a phone.
- Filipino customers often write in Taglish. Reply in whatever mix they used; Taglish is welcome.
- Be warm and a bit playful, the way a small family shop is. Don't be corporate.
- If someone wants to complain, cancel, change an order, or asks something you can't answer, say the owner will get back to them and ask for their name and number.

End your reply with the token [HUMAN] — on its own, after your message — when the person needs the owner: a complaint, a cancellation, a bulk or catering order, a question about a specific existing order, or anything you couldn't answer. The token is stripped before the customer sees it; it only flags the thread for the owner.`;

export type AssistantReply = { text: string; needsHuman: boolean };

/**
 * One assistant turn.
 *
 * Errors are deliberately swallowed into a friendly fallback that still points
 * at a human — a chat widget that shows a stack trace, or nothing at all, is
 * worse for the shop than one that says "message us and we'll reply".
 */
export async function askAssistant(history: ChatTurn[]): Promise<AssistantReply> {
  if (!assistantConfigured()) {
    return {
      text: "Chat isn't switched on yet — please message us on Facebook or call +63 947 353 3060 and we'll help you right away.",
      needsHuman: true,
    };
  }

  try {
    const facts = await shopFacts();
    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1000,
      // Low effort: this is short customer-service chat, not a reasoning task,
      // and it keeps replies quick and cheap.
      output_config: { effort: "low" },
      system: [
        { type: "text", text: SYSTEM },
        // The stable instructions sit first and the volatile facts after, so
        // the cached prefix survives a menu edit.
        { type: "text", text: `SHOP FACTS\n${facts}`, cache_control: { type: "ephemeral" } },
      ],
      // Keep the last few turns only — a chat widget doesn't need the whole
      // history, and it bounds what a long session costs.
      messages: history.slice(-12).map((t) => ({ role: t.role, content: t.content })),
    });

    if (response.stop_reason === "refusal") {
      return {
        text: "Sorry, I can't help with that one — but the owner can. What's your name and number?",
        needsHuman: true,
      };
    }

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const needsHuman = raw.includes("[HUMAN]");
    const text = raw.replace(/\[HUMAN\]/g, "").trim();

    return {
      text:
        text ||
        "Sorry, I didn't catch that. Could you say it another way, or message us on Facebook?",
      needsHuman,
    };
  } catch {
    return {
      text: "Sorry — I'm having trouble replying right now. Message us on Facebook or call +63 947 353 3060 and we'll sort you out.",
      needsHuman: true,
    };
  }
}
