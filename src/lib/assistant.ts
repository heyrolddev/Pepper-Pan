import "server-only";
import {
  OFFER_WORDS,
  offers,
  recommendation,
  type AnswerFacts,
} from "@/lib/assistant-answers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  openState,
  describeWeek,
  type Closure,
  type DayHours,
  type ShopSettings,
} from "@/lib/hours";

export type ChatTurn = { role: "user" | "assistant" | "staff"; content: string };
export type AssistantReply = { text: string; needsHuman: boolean };

type FaqEntry = { id: string; answer: string; triggers: string[]; priority: number };

/**
 * "Ask Pepper Pan" answers from the shop's own data — no AI model, no API key,
 * nothing to pay for.
 *
 * The trade is deliberate: this can only answer the questions it recognises,
 * but it can never invent a dish, quote a price the shop doesn't charge, or
 * promise a delivery time. Everything it doesn't recognise goes to the owner
 * as a lead rather than being guessed at, which for a food stall is the
 * honest failure mode — most of what people actually ask is the menu, the
 * price, the hours and the delivery fee.
 */

type Meal = {
  /** Carried so a pinned recommendation can be looked up by reference rather
   *  than by name — a renamed dish must not silently stop being the pick. */
  id: string;
  name: string;
  price: number;
  description: string | null;
  is_available: boolean;
};

type Facts = {
  faq: FaqEntry[];
  hours: DayHours[];
  closures: Closure[];
  shop: ShopSettings | null;
  meals: Meal[];
  /** What to recommend: the owner's pick, or the sum when they haven't made one. */
  bestSeller: string | null;
  /** True when a person chose it, which changes how the reply is worded. */
  bestSellerPinned: boolean;
  /** The owner's own words about the recommendation, in place of the menu blurb. */
  featuredNote: string | null;
  /** Live promos, straight from the ones written for the homepage. */
  promos: { title: string; body: string | null }[];
  /** Standing offers that are not announcements. */
  promoNote: string | null;
  delivery: {
    enabled: boolean;
    baseFee: number;
    baseKm: number;
    perKm: number;
    minFee: number;
    maxKm: number;
    freeOver: number;
  } | null;
  payment: {
    cod: boolean;
    gcash: boolean;
    gcashName: string | null;
    gcashNumber: string | null;
    downpayment: boolean;
    downpaymentPercent: number;
  } | null;
};

const PHONE = "+63 947 353 3060";
const WHERE = "in front of Palengkeni, beside Osave, Apalit";

const peso = (n: number) =>
  "₱" + Number(n).toLocaleString("en-PH", { maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Reading the shop
// ---------------------------------------------------------------------------

/**
 * The shop's facts change when the owner edits them, not between two
 * messages of one conversation — so re-reading the menu, both settings rows
 * and two thousand order lines on every single reply was pure waste. A short
 * cache keeps a busy evening cheap while still picking up a price change
 * within a minute.
 */
let factsCache: { at: number; facts: Facts } | null = null;
const FACTS_TTL_MS = 60_000;

async function loadFacts(): Promise<Facts> {
  const cached = factsCache;
  if (cached && Date.now() - cached.at < FACTS_TTL_MS) return cached.facts;

  const facts = await readFacts();
  factsCache = { at: Date.now(), facts };
  return facts;
}

async function readFacts(): Promise<Facts> {
  const db = createAdminClient();

  const nowIso = new Date().toISOString();
  const [
    mealsRes,
    deliveryRes,
    paymentRes,
    linesRes,
    faqRes,
    hoursRes,
    closuresRes,
    shopRes,
    chatRes,
    promoRes,
  ] = await Promise.all([
    db
      .from("meals")
      .select("id, name, price, description, is_available")
      .eq("is_public", true)
      .order("name")
      .limit(200),
    db.from("delivery_settings").select("*").eq("id", 1).maybeSingle(),
    db.from("payment_settings").select("*").eq("id", 1).maybeSingle(),
    // The fallback recommendation, when the owner has not pinned one. The
    // price comes down with it because this is ranked by MONEY TAKEN, not by
    // units shifted — see `readFacts`'s note below, and 0052's.
    db
      .from("order_lines")
      .select("qty, price_at_sale, meals(name), orders!inner(status)")
      .neq("orders.status", "cancelled")
      .limit(2000),
    // The service-role client bypasses RLS, so the is_active filter has to be
    // spelled out here — a switched-off answer must stay switched off.
    db
      .from("faq_entries")
      .select("id, answer, triggers, priority")
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(200),
    db.from("shop_hours").select("weekday, is_open, opens, closes").order("weekday"),
    db
      .from("shop_closures")
      .select("closed_on, reason")
      .gte("closed_on", new Date().toISOString().slice(0, 10))
      .order("closed_on")
      .limit(30),
    db
      .from("shop_settings")
      .select("accepting_orders, paused_message, min_lead_hours, max_days_ahead")
      .eq("id", 1)
      .maybeSingle(),
    // What the owner decided this should say, rather than what the sums did.
    db
      .from("chat_settings")
      .select("featured_meal_id, featured_note, promo_note")
      .eq("id", 1)
      .maybeSingle(),
    // The promos already written for the homepage. Read here rather than
    // retyped, so the chat cannot go on advertising one that has ended —
    // which is the failure mode of every "also paste it in here" field.
    // Same window the row policy and `liveStateOf` use.
    db
      .from("announcements")
      .select("kind, title, body, starts_at, ends_at, pinned, sort_order")
      .in("kind", ["promo", "dine_in"])
      .eq("is_active", true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
      .order("pinned", { ascending: false })
      .order("sort_order")
      .limit(4),
  ]);

  /**
   * The fallback recommendation — by money taken, not by units shifted.
   *
   * This used to rank on quantity, and it told customers the shop's
   * bestseller was extra rice. It was not wrong about the count: rice is ₱25
   * and goes on half the orders, so it out-counts a ₱189 rice meal forever.
   * It was answering the wrong question. Someone asking what to try wants the
   * dish the shop is known for, and what a shop is known for shows up in what
   * it TAKES, not in how many small things left the kitchen.
   *
   * Still only a fallback: the owner's pick wins, because the best thing to
   * recommend is a decision about margin and reputation that no sum can make.
   */
  const tally = new Map<string, number>();
  type Line = { qty: number; price_at_sale: number; meals: { name: string } | null };
  for (const line of (linesRes.data ?? []) as unknown as Line[]) {
    const name = line.meals?.name;
    if (!name) continue;
    const took = (Number(line.qty) || 0) * (Number(line.price_at_sale) || 0);
    tally.set(name, (tally.get(name) ?? 0) + took);
  }
  const earned = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const chat = chatRes.data as
    | { featured_meal_id: string | null; featured_note: string | null; promo_note: string | null }
    | null;
  const mealList = (mealsRes.data ?? []) as Meal[];
  const pinned = chat?.featured_meal_id
    ? (mealList.find((m) => m.id === chat.featured_meal_id) ?? null)
    : null;
  const bestSeller = pinned?.name ?? earned;

  const d = deliveryRes.data;
  const p = paymentRes.data;

  return {
    // Missing table (migration 0012 not run yet) simply means no custom
    // answers — the built-in ones still work.
    faq: (faqRes.data ?? []) as FaqEntry[],
    hours: (hoursRes.data ?? []) as DayHours[],
    closures: (closuresRes.data ?? []) as Closure[],
    shop: (shopRes.data as ShopSettings | null) ?? null,
    meals: mealList,
    bestSeller,
    bestSellerPinned: pinned !== null,
    featuredNote: chat?.featured_note?.trim() || null,
    promos: ((promoRes.data ?? []) as { title: string; body: string | null }[]).map((a) => ({
      title: a.title,
      body: a.body,
    })),
    promoNote: chat?.promo_note?.trim() || null,
    delivery: d
      ? {
          enabled: Boolean(d.is_enabled),
          baseFee: Number(d.base_fee ?? 0),
          baseKm: Number(d.base_km ?? 0),
          perKm: Number(d.per_km_fee ?? 0),
          minFee: Number(d.min_fee ?? 0),
          maxKm: Number(d.max_km ?? 0),
          freeOver: Number(d.free_over ?? 0),
        }
      : null,
    payment: p
      ? {
          cod: Boolean(p.cod_enabled),
          gcash: Boolean(p.gcash_enabled),
          gcashName: p.gcash_name ?? null,
          gcashNumber: p.gcash_number ?? null,
          downpayment: Boolean(p.downpayment_enabled),
          downpaymentPercent: Number(p.downpayment_percent ?? 50),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Reading the question
// ---------------------------------------------------------------------------

/** Lowercase, strip accents and punctuation, so "Magkano?" matches "magkano". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match at the start of a word, never mid-word.
 *
 * A plain substring test reads "Apalit" as the complaint word "palit" and
 * "hindi" as the greeting "hi" — so the shop's own town would have gone to
 * the owner as a complaint. Anchoring to a word start keeps Tagalog prefixes
 * working ("cancel" still finds "cancelling") without those collisions.
 */
const has = (haystack: string, needles: string[]) => {
  const padded = " " + haystack;
  return needles.some((n) => padded.includes(" " + n));
};

/** Whole words only — for markers short enough to hide inside other words. */
const hasWord = (haystack: string, needles: string[]) => {
  const words = new Set(haystack.split(" "));
  return needles.some((n) => words.has(n));
};

/**
 * Filipino customers write in Taglish, English, or Tagalog depending on mood.
 * Matching the mix they used is the difference between a reply that sounds
 * like the shop and one that sounds like a bank.
 */
const TAGALOG_MARKERS = [
  "po", "ba", "ng", "ano", "magkano", "meron", "kayo", "ninyo", "niyo",
  "yung", "yan", "ito", "sana", "salamat", "kuya", "ate", "paano", "saan",
  "kailan", "pwede", "puwede", "gusto", "bukas", "sarado", "presyo", "bayad",
  "magbayad", "hatid", "padeliver", "kami", "namin", "akin", "ako", "mag",
  "naman", "lang", "dito", "diyan", "dyan", "opo", "sige",
];

function speaksTaglish(text: string): boolean {
  return hasWord(normalize(text), TAGALOG_MARKERS);
}

/** Menu items the message names, longest name first so "milktea" beats "tea". */
function mealsMentioned(message: string, meals: Meal[]): Meal[] {
  const n = normalize(message);
  const hits: { meal: Meal; score: number }[] = [];

  for (const meal of meals) {
    const name = normalize(meal.name);
    if (!name) continue;

    if (n.includes(name)) {
      hits.push({ meal, score: name.length + 100 });
      continue;
    }
    // Partial match on the distinctive words of the name, so "jipai" finds
    // "Jipai Chicken Chop" and "wings" finds "Chicken Wings".
    const words = name.split(" ").filter((w) => w.length >= 4);
    const matched = words.filter((w) => n.includes(w));
    if (matched.length > 0) {
      hits.push({ meal, score: matched.join("").length });
    }
  }

  return hits.sort((a, b) => b.score - a.score).map((h) => h.meal);
}

/**
 * The owner's own answer for this message, if one fits.
 *
 * Checked before every built-in reply, because an answer the owner wrote by
 * hand is the shop correcting us — if they've written something about
 * delivery, their words beat our generated sentence.
 *
 * Ties break on the owner's priority, then on the longest trigger matched, so
 * a specific entry ("chicken wings") wins over a broad one ("chicken").
 */
function matchFaq(message: string, faq: FaqEntry[]): FaqEntry | null {
  const n = normalize(message);
  let best: { entry: FaqEntry; score: number } | null = null;

  for (const entry of faq) {
    let longest = 0;
    for (const raw of entry.triggers ?? []) {
      const trigger = normalize(raw);
      if (trigger && has(n, [trigger])) longest = Math.max(longest, trigger.length);
    }
    if (longest === 0) continue;

    const score = entry.priority * 1000 + longest;
    if (!best || score > best.score) best = { entry, score };
  }

  return best?.entry ?? null;
}

// ---------------------------------------------------------------------------
// The answers
// ---------------------------------------------------------------------------

function deliveryAnswer(f: Facts, tl: boolean): string {
  const d = f.delivery;
  if (!d) {
    return tl
      ? "Hindi pa po naka-set ang delivery details namin. Tawag na lang po kayo sa " + PHONE + " para masagot agad."
      : "Our delivery details aren't set up yet. Call us on " + PHONE + " and we'll sort you out.";
  }
  if (!d.enabled) {
    return tl
      ? `Pickup po muna kami sa ngayon — nasa ${WHERE} po kami. Pasensya na po!`
      : `We're pickup-only at the moment — you'll find us ${WHERE}.`;
  }

  const free =
    d.freeOver > 0
      ? tl
        ? ` Libre na po ang delivery pag umabot ng ${peso(d.freeOver)} ang order niyo!`
        : ` Delivery is free on orders over ${peso(d.freeOver)}!`
      : "";

  return tl
    ? `Nagdedeliver po kami! ${peso(d.baseFee)} po para sa unang ${d.baseKm} km, tapos ${peso(d.perKm)} kada dagdag na km — hanggang ${d.maxKm} km po ang abot namin.${free} Lalabas po ang exactong fee sa checkout pag na-pin niyo ang location niyo.`
    : `Yes, we deliver! ${peso(d.baseFee)} covers the first ${d.baseKm} km, then ${peso(d.perKm)} per extra km, up to ${d.maxKm} km.${free} Your exact fee shows at checkout once you drop your pin.`;
}

function paymentAnswer(f: Facts, tl: boolean): string {
  const p = f.payment;
  if (!p || (!p.cod && !p.gcash)) {
    return tl
      ? "Tawag po kayo sa " + PHONE + " para sa payment details, sagot po namin agad."
      : "Give us a ring on " + PHONE + " for payment details and we'll help right away.";
  }

  const ways: string[] = [];
  if (p.gcash) {
    const who = p.gcashNumber
      ? ` (${p.gcashNumber}${p.gcashName ? `, ${p.gcashName}` : ""})`
      : "";
    ways.push(`GCash${who}`);
  }
  if (p.cod) ways.push(tl ? "cash pagdating ng order" : "cash on delivery or at the stall");

  const dp =
    p.gcash && p.downpayment
      ? tl
        ? ` Pwede rin po ang ${p.downpaymentPercent}% downpayment sa GCash, tapos cash na po ang balance pagdating.`
        : ` You can also send a ${p.downpaymentPercent}% down payment on GCash and pay the balance in cash on handover.`
      : "";

  return tl
    ? `Pwede po kayo mag-${ways.join(" o ")}.${dp}`
    : `You can pay by ${ways.join(" or ")}.${dp}`;
}

function menuAnswer(f: Facts, tl: boolean): string {
  const available = f.meals.filter((m) => m.is_available);
  if (available.length === 0) {
    return tl
      ? "Wala pa pong nakalista sa menu ngayon. Tingnan niyo po ulit mamaya, o tawag sa " + PHONE + "."
      : "Nothing's listed on the menu right now. Check back shortly, or call " + PHONE + ".";
  }

  const list = available
    .slice(0, 6)
    .map((m) => `${m.name} (${peso(m.price)})`)
    .join(", ");
  const more =
    available.length > 6
      ? tl
        ? ` …at ${available.length - 6} pa po sa Menu page.`
        : ` …and ${available.length - 6} more on the Menu page.`
      : "";

  return tl
    ? `Meron po kaming ${list}.${more} Buong menu po nasa Menu page — pwede na po kayo mag-order doon.`
    : `We've got ${list}.${more} The full menu's on the Menu page, and you can order right from there.`;
}

function priceAnswer(meals: Meal[], tl: boolean): string {
  const lines = meals
    .slice(0, 3)
    .map((m) => {
      const out = m.is_available
        ? ""
        : tl
          ? " (ubos po ngayon)"
          : " (sold out right now)";
      return `${m.name} — ${peso(m.price)}${out}`;
    })
    .join("\n");

  const one = meals.length === 1 ? meals[0] : null;
  const blurb = one?.description ? `\n\n${one.description}` : "";

  return tl
    ? `Ito po ang presyo:\n${lines}${blurb}\n\nPwede na po kayo mag-order sa Menu page.`
    : `Here you go:\n${lines}${blurb}\n\nYou can order it on the Menu page.`;
}

/**
 * The real schedule, and whether the shop is open as they ask.
 *
 * This used to send people to the phone because there was nothing to read.
 * Now the week comes from the same rows the checkout enforces, so the
 * assistant can never promise hours the site won't honour.
 */
function hoursAnswer(f: Facts, tl: boolean): string {
  if (f.hours.length === 0) {
    return tl
      ? `Para sigurado po sa oras namin ngayong araw, tawag lang po sa ${PHONE}. Nasa ${WHERE} po kami.`
      : `For today's exact hours give us a ring on ${PHONE}. You'll find us ${WHERE}.`;
  }

  const settings: ShopSettings = f.shop ?? {
    accepting_orders: true,
    paused_message: null,
    min_lead_hours: 2,
    max_days_ahead: 14,
  };
  const state = openState(f.hours, f.closures, settings);

  const now = state.isOpen
    ? tl
      ? "Bukas po kami ngayon! 🧡"
      : "We're open right now! 🧡"
    : `${state.reason ?? (tl ? "Sarado po kami ngayon." : "We're closed at the moment.")}${
        state.opensNext ? ` ${state.opensNext}.` : ""
      }`;

  return tl
    ? `${now}\n\nSchedule po namin:\n${describeWeek(f.hours)}\n\nNasa ${WHERE} po kami.`
    : `${now}\n\nOur week:\n${describeWeek(f.hours)}\n\nYou'll find us ${WHERE}.`;
}

/** The shape `assistant-answers` wants, out of the facts we hold. */
function answerFacts(f: Facts): AnswerFacts {
  const dish = f.bestSeller ? (f.meals.find((m) => m.name === f.bestSeller) ?? null) : null;
  return {
    dish: dish
      ? { name: dish.name, price: dish.price, description: dish.description }
      : null,
    pinned: f.bestSellerPinned,
    note: f.featuredNote,
    promos: f.promos,
    promoNote: f.promoNote,
  };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/** Things only the owner should answer — asked first, so nothing else steals them. */
const ESCALATE = [
  "refund", "sauli", "reklamo", "complaint", "complain", "palit", "wrong order",
  "mali ang", "maling", "cancel", "kanselahin", "hindi dumating", "not arrived",
  "delayed", "matagal", "lamig na", "panis", "sira", "spoiled", "catering",
  "bulk", "party", "reserve", "reservation", "booking", "invoice", "resibo",
  "receipt", "franchise", "supplier", "partnership", "sponsor",
];

/** Questions about one particular existing order — the assistant can't see those. */
const ORDER_STATUS = [
  "my order", "order ko", "san na", "nasaan na", "where is my", "track",
  "order number", "status ng order", "kailan darating", "when will",
];

export async function askAssistant(history: ChatTurn[]): Promise<AssistantReply> {
  const last = [...history].reverse().find((t) => t.role === "user");
  const message = last?.content ?? "";
  const n = normalize(message);
  const tl = speaksTaglish(message);

  if (!n) {
    return {
      text: tl
        ? "Ano po ang maitutulong namin? Tanong lang po tungkol sa menu, presyo o delivery."
        : "How can we help? Ask us anything about the menu, prices or delivery.",
      needsHuman: false,
    };
  }

  // --- things that need a person, checked before anything else -------------
  if (has(n, ESCALATE)) {
    return {
      text: tl
        ? `Ipapasa ko po ito kay owner para siya mismo ang sumagot. Ano po ang pangalan at number niyo? Pwede rin po kayo tumawag sa ${PHONE}.`
        : `Let me pass this to the owner so they can answer you properly. What's your name and number? You can also call us on ${PHONE}.`,
      needsHuman: true,
    };
  }

  if (has(n, ORDER_STATUS)) {
    return {
      text: tl
        ? "Makikita niyo po ang status ng order niyo sa My Orders page — may live countdown pa po kung kailan matatapos. Kung may mali po, sabihin niyo lang ang pangalan at number niyo at si owner na po ang sasagot."
        : "You can see your order's live status — with a countdown — on the My Orders page. If something looks wrong, leave your name and number and the owner will come back to you.",
      needsHuman: true,
    };
  }

  const facts = await loadFacts();

  // --- the owner's own answers, before any of ours -------------------------
  const owned = matchFaq(message, facts.faq);
  if (owned) {
    // Counting the hit is best-effort: an answer that reached the customer
    // shouldn't fail because a statistic didn't save.
    try {
      await createAdminClient().rpc("bump_faq_hit", { p_id: owned.id });
    } catch {
      /* the answer still went out, which is what matters */
    }
    return { text: owned.answer, needsHuman: false };
  }

  // --- specific dish, with or without a price word -------------------------
  const named = mealsMentioned(message, facts.meals);
  const asksPrice = has(n, [
    "magkano", "how much", "price", "presyo", "cost", "bayad ba", "pila",
  ]);

  if (named.length > 0 && !has(n, ["deliver", "hatid", "padeliver"])) {
    return { text: priceAnswer(named, tl), needsHuman: false };
  }

  // --- delivery ------------------------------------------------------------
  if (has(n, ["deliver", "delivery", "padeliver", "ipadeliver", "hatid", "ihatid", "paabot", "ship", "rider", "pickup", "pick up", "sundo", "susunduin"])) {
    return { text: deliveryAnswer(facts, tl), needsHuman: false };
  }

  // --- payment -------------------------------------------------------------
  if (has(n, ["gcash", "cod", "cash", "bayad", "magbayad", "nagbayad", "babayaran", "payment", "pay", "downpayment", "down payment", "maya", "bank"])) {
    return { text: paymentAnswer(facts, tl), needsHuman: false };
  }

  // --- promos and deals ----------------------------------------------------
  //
  // Checked BEFORE the recommendation, and the order matters: "what's your
  // best deal" contains "best", which the branch below also listens for. A
  // customer asking about offers would otherwise be told about a dish.
  if (has(n, OFFER_WORDS)) {
    return { text: offers(answerFacts(facts), tl), needsHuman: false };
  }

  // --- bestseller / recommendation ----------------------------------------
  if (has(n, ["bestseller", "best seller", "sikat", "masarap", "recommend", "suggest", "ano maganda", "ano masarap", "paborito", "favorite", "popular", "top"])) {
    return { text: recommendation(answerFacts(facts), tl), needsHuman: false };
  }

  // --- hours ---------------------------------------------------------------
  if (has(n, ["oras", "open", "bukas", "sarado", "close", "closed", "what time", "anong time", "hours", "schedule"])) {
    return { text: hoursAnswer(facts, tl), needsHuman: false };
  }

  // --- where are you -------------------------------------------------------
  if (has(n, ["saan", "where", "address", "location", "lugar", "pupunta", "branch", "tindahan", "malapit"])) {
    return {
      text: tl
        ? `Nasa ${WHERE} po kami! Kung malayo po kayo, pwede rin po namin i-deliver — sabihin niyo lang.`
        : `You'll find us ${WHERE}! If you're further out we can deliver too — just say the word.`,
      needsHuman: false,
    };
  }

  // --- how do I order ------------------------------------------------------
  if (has(n, ["paano mag order", "paano umorder", "how do i order", "how to order", "paano po mag", "mag order", "place an order", "reserve ko"])) {
    return {
      text: tl
        ? "Pumunta lang po kayo sa Menu page, pindutin ang gusto niyo, tapos Checkout. Pipiliin niyo po kung pickup o delivery, at kung GCash o cash. Makikita niyo po agad ang progress sa My Orders."
        : "Head to the Menu page, tap what you want, then Checkout. You'll choose pickup or delivery and GCash or cash, and you can watch your order's progress under My Orders.",
      needsHuman: false,
    };
  }

  // --- contact -------------------------------------------------------------
  if (has(n, ["number", "contact", "tawag", "call", "phone", "cellphone", "hotline", "messenger", "facebook"])) {
    return {
      text: tl
        ? `Eto po ang number namin: ${PHONE}. Nasa ${WHERE} din po kami kung gusto niyo dumaan.`
        : `Our number is ${PHONE}. We're also ${WHERE} if you'd rather drop by.`,
      needsHuman: false,
    };
  }

  // --- menu ----------------------------------------------------------------
  if (has(n, ["menu", "ano meron", "anong meron", "what do you", "food", "pagkain", "ulam", "list", "available", "sell", "offer", "drinks", "inumin"])) {
    return { text: menuAnswer(facts, tl), needsHuman: false };
  }

  // --- a bare "how much" with no dish named --------------------------------
  if (asksPrice) {
    return { text: menuAnswer(facts, tl), needsHuman: false };
  }

  // --- pleasantries --------------------------------------------------------
  if (has(n, ["salamat", "thank", "thanks", "sige po", "ok po", "okay po"])) {
    return {
      text: tl
        ? "Walang anuman po! Kita-kits sa Pepper Pan 🧡"
        : "Anytime! See you at Pepper Pan 🧡",
      needsHuman: false,
    };
  }

  if (
    hasWord(n, ["hi", "hello", "hey", "kumusta", "kamusta", "musta", "yo"]) ||
    has(n, ["good morning", "good afternoon", "good evening"])
  ) {
    return {
      text: tl
        ? "Kumusta po! 🧡 Tanong lang po tungkol sa menu, presyo, delivery o bayad — sagot po agad."
        : "Hello! 🧡 Ask us anything about the menu, prices, delivery or payment — we'll answer right away.",
      needsHuman: false,
    };
  }

  // --- didn't recognise it: hand it to the owner, don't guess --------------
  return {
    text: tl
      ? `Hindi ko po sigurado ang sagot diyan — pero si owner po ang makakasagot. Ano po ang pangalan at number niyo? O tawag lang po sa ${PHONE}.`
      : `I'm not sure about that one — but the owner can answer it. What's your name and number? Or call us on ${PHONE}.`,
    needsHuman: true,
  };
}
