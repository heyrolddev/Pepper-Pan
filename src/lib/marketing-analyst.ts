import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type ShopSnapshot = {
  generatedAt: string;
  window: string;
  revenue: { last30: number; prior30: number; avgOrder: number; currency: "PHP" };
  orders: { last30: number; prior30: number; cancelRate: number };
  fulfillment: { pickup: number; delivery: number; deliveryFees: number };
  payments: { cod: number; gcash: number; unpaidGcash: number };
  customers: { total: number; repeat: number; newLast30: number };
  bestSellers: { name: string; qty: number; revenue: number }[];
  slowMovers: { name: string; qty: number; price: number }[];
  byHour: { hour: number; orders: number }[];
  byWeekday: { day: string; orders: number; revenue: number }[];
  reviews: { count: number; average: number; recent: { rating: number; comment: string }[] };
  questionsAsked: string[];
};

export type Advice = {
  headline: string;
  readings: { title: string; detail: string }[];
  ads: { audience: string; hook: string; why: string; budget: string }[];
  social: { day: string; platform: string; idea: string; caption: string }[];
  promos: { name: string; mechanic: string; why: string; watchOut: string }[];
  menu: string[];
};

export function analystConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You are a marketing analyst for Pepper Pan, a small family-run Taiwan-style street food shop in Apalit, Pampanga, Philippines. The owner reads this directly — they run the stall themselves, they are not a marketer, and their ad budget is a few hundred pesos at a time.

Work only from the SNAPSHOT you are given. It is this shop's real sales data.

How to be useful here:
- Every claim must trace to a number in the snapshot. Quote the number. If the data is too thin to support a point, say the data is thin rather than inventing a trend.
- Small numbers are normal for a street stall. Twelve orders on a Saturday is a real signal, not a rounding error. Never dismiss the data as insufficient just because it is small.
- Recommend things a two-person stall can actually do this week: a boosted Facebook post, a TikTok filmed on a phone, a sign at the stall, a bundle, a cut-off-hours promo. Not brand campaigns, not influencer contracts, not loyalty apps.
- Peso amounts, Philippine context, local platforms (Facebook, Messenger, TikTok are what matter here; Instagram far less).
- Taglish in captions is good and normal. Keep the analysis itself in plain English.
- Be specific and concrete over encouraging. "Your 6-8pm rush is 3x your lunch — put the boost budget there" beats "engage your audience".
- Name the risk in a promo (margin, queue length, stock) rather than only the upside.

Reply with a single JSON object and nothing else — no prose before it, no code fence. Shape:
{
  "headline": "one sentence, the single most important thing in the data",
  "readings": [{"title": "...", "detail": "what the numbers say and what it means"}],
  "ads": [{"audience": "who to target and where", "hook": "the actual line to use", "why": "the number behind it", "budget": "e.g. ₱300 over 3 days"}],
  "social": [{"day": "Mon", "platform": "TikTok" | "Facebook", "idea": "what to film or post", "caption": "the actual caption, Taglish welcome"}],
  "promos": [{"name": "...", "mechanic": "exactly how it works", "why": "the number behind it", "watchOut": "the risk"}],
  "menu": ["observation about a dish, its price, or its stock"]
}

Give 3-5 readings, 3-4 ads, 5-7 social posts covering a week, 2-4 promos, 2-5 menu notes.`;

/** Strip a stray code fence, then take the outermost JSON object. */
function parseAdvice(raw: string): Advice | null {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<Advice>;
    if (!parsed || typeof parsed.headline !== "string") return null;
    return {
      headline: parsed.headline,
      readings: Array.isArray(parsed.readings) ? parsed.readings : [],
      ads: Array.isArray(parsed.ads) ? parsed.ads : [],
      social: Array.isArray(parsed.social) ? parsed.social : [],
      promos: Array.isArray(parsed.promos) ? parsed.promos : [],
      menu: Array.isArray(parsed.menu) ? parsed.menu : [],
    };
  } catch {
    return null;
  }
}

/**
 * Ask Claude to read the shop's numbers and come back with things to do.
 *
 * Streamed rather than awaited in one shot: the analysis runs long enough
 * that a plain request risks the platform's response timeout, and the SDK's
 * `finalMessage()` gives us the whole reply once it lands either way.
 */
export async function analyseShop(
  snapshot: ShopSnapshot
): Promise<{ advice: Advice | null; error: string | null }> {
  if (!analystConfigured()) {
    return {
      advice: null,
      error:
        "Add ANTHROPIC_API_KEY to your Vercel environment variables to switch on the analysis.",
    };
  }

  try {
    const client = new Anthropic();
    const stream = client.messages.stream({
      model: "claude-opus-5",
      max_tokens: 8000,
      // The useful version of this reads several series against each other —
      // hours against weekdays against which dishes sell — so it's worth
      // letting the model think before it answers.
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: SYSTEM,
          // The brief never changes between runs; only the numbers do.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `SNAPSHOT\n${JSON.stringify(snapshot, null, 2)}\n\nAnalyse this and reply with the JSON object.`,
        },
      ],
    });

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      return { advice: null, error: "The analysis couldn't be produced for this data." };
    }

    const raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const advice = parseAdvice(raw);
    if (!advice) {
      return {
        advice: null,
        error: "The analysis came back in an unexpected shape. Try running it again.",
      };
    }
    return { advice, error: null };
  } catch (e) {
    return {
      advice: null,
      error:
        e instanceof Error
          ? `Couldn't run the analysis: ${e.message}`
          : "Couldn't run the analysis. Please try again.",
    };
  }
}
