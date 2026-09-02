/**
 * What the shop's own assistant knows about the shop's own software.
 *
 * There is no language model behind this and nothing to pay for — the same
 * trade as "Ask Pepper Pan" on the customer side, made for the same reason.
 * What it costs is that it can only answer what it recognises. What it buys is
 * that it cannot invent a screen that doesn't exist, describe a button that
 * was renamed last month, or make up how a figure was worked out. For the
 * question this was actually built to answer — "paano naging ganyan ang
 * number na 'to?" — a made-up answer would be worse than no answer at all,
 * because it would be believed.
 *
 * Where a topic names `numbers`, the reply is not written here: the server
 * runs the very same function the screen ran, and narrates its inputs. That
 * is what makes the explanation true rather than merely plausible — if the
 * calculation changes, the explanation changes with it, because they are the
 * same calculation.
 *
 * Answers are in English with the words a Filipino owner actually uses —
 * utang, sold out, palit. Triggers carry both languages so the question can
 * be asked either way.
 */

export type ExplainKind =
  | "net_profit"
  | "break_even"
  | "cash"
  | "utang"
  | "payback"
  | "dish_margin"
  | "stock"
  | "today";

export type GuideTopic = {
  id: string;
  /** How the topic is offered as a suggestion. */
  question: string;
  /** English and Tagalog. Short ones are matched on word boundaries. */
  triggers: string[];
  answer: string;
  /** The screen this is about. */
  where?: { href: string; label: string };
  /** Ask the server to work the real figures out and show them. */
  numbers?: ExplainKind;
  group: Group;
};

export type Group = "Money" | "The kitchen" | "Every day" | "Setting up" | "People";

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Short words are matched whole, longer ones anywhere.
 *
 * Without the word boundary "oe" matches "doesn't" and every question becomes
 * a lecture about operating expenses.
 */
function mentions(haystack: string, trigger: string): boolean {
  const t = normalize(trigger);
  if (!t) return false;
  if (t.length <= 4) return new RegExp(`(^| )${t}( |$)`).test(haystack);
  return haystack.includes(t);
}

/**
 * The best topic for a question, or nothing.
 *
 * Scored by the length of what matched, so a question naming "break even"
 * beats one that merely contains "cost". Returning nothing is a real answer
 * here — the reply offers the topic list rather than guessing.
 */
export function findTopic(question: string, topics: GuideTopic[] = TOPICS): GuideTopic | null {
  const q = normalize(question);
  if (q.length < 2) return null;

  let best: { topic: GuideTopic; score: number } | null = null;
  for (const topic of topics) {
    let score = 0;
    let longest = 0;
    for (const trigger of topic.triggers) {
      if (mentions(q, trigger)) {
        score += trigger.length;
        longest = Math.max(longest, trigger.length);
      }
    }
    // Two-letter triggers are allowed because "OE" is a real question, and
    // `mentions` only accepts short ones on a word boundary — so this cannot
    // fire on the "oe" inside "does".
    if (longest < 2) continue;
    if (!best || score > best.score) best = { topic, score };
  }
  return best && best.score >= 2 ? best.topic : null;
}

/** A few things worth asking, for an empty box or a question nothing matched. */
export function suggestions(n = 6): GuideTopic[] {
  const wanted = [
    "net-profit",
    "break-even",
    "dish-margin",
    "restock",
    "promo-run",
    "roles",
  ];
  return wanted.map((id) => TOPICS.find((t) => t.id === id)!).filter(Boolean).slice(0, n);
}

export function topicsByGroup(): { group: Group; topics: GuideTopic[] }[] {
  const order: Group[] = ["Money", "The kitchen", "Every day", "People", "Setting up"];
  return order.map((group) => ({
    group,
    topics: TOPICS.filter((t) => t.group === group),
  }));
}

/**
 * Filipino owners write in Taglish. Matching the mix keeps the reply sounding
 * like the shop rather than like a bank.
 */
const TAGALOG_MARKERS = [
  "po", "ba", "ano", "paano", "bakit", "saan", "kailan", "magkano", "ilan",
  "yung", "ito", "iyan", "meron", "pwede", "puwede", "gusto", "kailangan",
  "namin", "natin", "ako", "ko", "mo", "niya", "nila", "lang", "naman",
  "kasi", "pala", "sana", "salamat", "utang", "kita", "bayad", "presyo",
];

export function speaksTaglish(text: string): boolean {
  const q = normalize(text);
  return TAGALOG_MARKERS.some((m) => new RegExp(`(^| )${m}( |$)`).test(q));
}

/** The line before an answer, in the language the question came in. */
export function opener(question: string, topic: GuideTopic): string {
  return speaksTaglish(question)
    ? `Ito po ang tungkol sa ${topic.question.toLowerCase()} —`
    : "";
}

export function noMatchReply(question: string): string {
  return speaksTaglish(question)
    ? "Hindi ko pa alam 'yan — hindi ko ito iimbento. Subukan mo isa sa mga nasa ibaba, o itanong ulit gamit ang ibang salita (halimbawa: \"break even\", \"utang\", \"restock\")."
    : "I don't know that one, and I won't invent an answer. Try one of the topics below, or ask again using a different word — for example \"break even\", \"utang\" or \"restock\".";
}

/* ------------------------------------------------------------------ */
/* What it knows                                                       */
/* ------------------------------------------------------------------ */

export const TOPICS: GuideTopic[] = [
  // ---------------- Money -------------------------------------------
  {
    id: "net-profit",
    group: "Money",
    question: "How is net profit worked out?",
    triggers: ["net profit", "netprofit", "kita", "profit", "tubo", "how much did i make", "earnings", "net"],
    numbers: "net_profit",
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "Net profit is what is actually left, not what came in.\n\n" +
      "It goes in three steps:\n" +
      "• Revenue − ingredient cost (COGS) = gross profit\n" +
      "• Gross profit − operating expenses (OE) = before waste\n" +
      "• minus anything thrown away = net profit\n\n" +
      "The part most people miss is OE. Rent, electricity and the rest still have to be paid on a slow day, so the shop's monthly fixed costs are divided by how many days a month it opens, and each trading day is charged that share. A day can take good money and still lose it.",
  },
  {
    id: "gross-profit",
    group: "Money",
    question: "What is gross profit, and how is it different?",
    triggers: ["gross profit", "gross", "cogs", "cost of goods", "ingredient cost", "gastos sa sangkap"],
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "Gross profit is revenue minus what the food itself cost — the ingredients and the packaging, nothing else.\n\n" +
      "It is the number that tells you whether your PRICES are right. Net profit tells you whether your BUSINESS is right. A dish can have a healthy gross profit and the shop still lose money, if rent is eating it.\n\n" +
      "COGS (cost of goods sold) is the ingredient side of that. Every order records its own COGS at the moment it was sold, using the ingredient prices at that time — so a later price rise does not quietly rewrite last month's profit.",
  },
  {
    id: "oe",
    group: "Money",
    question: "What is OE, and where does the daily figure come from?",
    triggers: ["oe", "operating expense", "overhead", "fixed cost", "rent", "upa", "kuryente", "electricity", "what is oe", "daily expense", "gastos araw araw"],
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "OE is everything the shop pays whether or not it sells a thing: rent, electricity, water, wifi, the stall fee.\n\n" +
      "You list them once on Costs & cash as monthly amounts. The daily figure is simply:\n" +
      "• monthly fixed costs ÷ days you open per month\n\n" +
      "So if your fixed costs are ₱13,000 and you open 26 days, every trading day carries ₱500 before a single peso of profit is counted. Change the 'days open per month' setting and every OE and break-even number moves with it.",
  },
  {
    id: "break-even",
    group: "Money",
    question: "How much do I need to sell in a day?",
    triggers: ["break even", "breakeven", "break-even", "how much to sell", "magkano dapat benta", "target sales", "quota", "need to sell", "how much should i sell", "kailangan ibenta", "sell in a day", "daily target"],
    numbers: "break_even",
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "Break-even is the sales a day that covers everything — so anything above it is real profit and anything below it is money out.\n\n" +
      "The maths:\n" +
      "• monthly fixed costs + a month's worth of waste\n" +
      "• ÷ your margin (the share of each peso left after ingredients)\n" +
      "• ÷ days you open per month\n\n" +
      "Dividing by the margin is the step people skip. If only 60 centavos of each peso survives the ingredients, you have to sell ₱1.67 to cover every ₱1 of rent — not ₱1.",
  },
  {
    id: "cash",
    group: "Money",
    question: "How is 'cash on hand' worked out?",
    triggers: ["cash on hand", "cash", "drawer", "pera", "laman ng kahon", "kaha", "cash balance"],
    numbers: "cash",
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "Cash on hand is what should be in the drawer right now:\n" +
      "• the amount you started with, on the date you set\n" +
      "• plus every CASH sale since then\n" +
      "• plus or minus anything you recorded in the cash ledger\n\n" +
      "GCash is deliberately left out. That money never touched the drawer, so counting it would make the drawer look permanently over.\n\n" +
      "If the real drawer and this number disagree, that gap is the useful part — it is usually an unrecorded 'labas' for supplies. Add it to the ledger and they agree again.",
  },
  {
    id: "utang",
    group: "Money",
    question: "How does utang (money owed to me) work?",
    triggers: ["utang", "receivable", "owed", "pautang", "hindi pa bayad", "unpaid", "collect", "owes", "owe me", "may utang", "singilin", "hindi nagbayad"],
    numbers: "utang",
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "Utang is money a customer still owes you. Each one records what was taken, what has been collected so far, and who it was.\n\n" +
      "The total shown is the unpaid remainder — amount minus what has already been collected — of everything not yet settled. Part payments are handled, so somebody who owed ₱500 and has paid ₱200 counts as ₱300, not ₱500 and not zero.\n\n" +
      "Utang is NOT counted as cash on hand. You cannot spend it yet.",
  },
  {
    id: "payback",
    group: "Money",
    question: "Have I earned back what I invested?",
    triggers: ["payback", "puhunan", "capital", "invest", "roi", "nabawi", "return on investment", "asset"],
    numbers: "payback",
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "Payback answers one question: has the shop earned back the money you put in to start it?\n\n" +
      "You list what you bought — the freezer, the pans, the signage — under Assets, and set the date you want counting from. From that date on, the shop's net earnings are added up and compared against the total you spent.\n\n" +
      "It is a slow number and it is meant to be. Watching it move a few per cent a month is the most honest picture of whether the stall is working.",
  },

  {
    id: "missing-money",
    group: "Money",
    question: "The money doesn't add up. What can I check?",
    triggers: [
      "stealing", "missing money", "nawawala", "kulang ang pera", "short",
      "doesn't add up", "hindi tama", "nagnanakaw", "discrepancy", "kulang",
      "money missing", "shrinkage", "who did this", "sino gumawa",
    ],
    where: { href: "/admin/inventory", label: "Inventory" },
    answer:
      "There are four places to look, and they answer different questions.\n\n" +
      "1. CASH — Costs & cash shows what should be in the drawer. Count the real drawer and compare. A gap is usually an unrecorded 'labas' for supplies, not a person.\n\n" +
      "2. STOCK — Inventory → an ingredient → Count. Type what is actually on the shelf and it shows the difference AND what that difference cost you. Ingredients walking out shows up here before it shows up in the money.\n\n" +
      "3. WHO CHANGED WHAT — the Staff screen carries an activity log: price changes, stock adjustments, role changes, who and when.\n\n" +
      "4. SHIFTS — each finished shift records what was rung up during it. A shift that took much less than the same shift usually does is a question worth asking, though it is not on its own an answer.\n\n" +
      "One honest warning: none of these proves anything by itself. The most common cause of all four looking wrong is simply that something was not recorded — a restock, a waste, a cash withdrawal. Check that first, kasi mas madalas 'yun kaysa sa pagnanakaw.",
  },

  // ---------------- The kitchen -------------------------------------
  {
    id: "dish-margin",
    group: "The kitchen",
    question: "What does each dish actually earn?",
    triggers: ["dish cost", "margin", "food cost", "recipe cost", "magkano kita sa", "per dish", "costing", "how much does a dish earn"],
    numbers: "dish_margin",
    where: { href: "/admin/costing", label: "Dish costs" },
    answer:
      "Dish costs works out what a plate costs to make, from its recipe: every ingredient at its current price, plus the packaging if it leaves the stall.\n\n" +
      "Two numbers come out of it:\n" +
      "• What you keep — price minus cost, in pesos\n" +
      "• Food cost % — the cost as a share of the price\n\n" +
      "The rule of thumb for a stall is to keep food cost at or under 30%. Above 40% and the dish is working for the supplier, not for you. A dish with no recipe yet shows as uncosted rather than as free — an unknown cost is not a zero cost.",
  },
  {
    id: "menu-engineering",
    group: "The kitchen",
    question: "What do star, plowhorse, puzzle and dog mean?",
    triggers: ["star", "plowhorse", "puzzle", "dog", "menu engineering", "which dish should i push", "alin ang benta"],
    where: { href: "/admin/analytics", label: "Analytics" },
    answer:
      "Every dish gets sorted by two things: how often it sells, and how much it keeps.\n\n" +
      "• STAR — sells a lot, keeps a lot. Protect it. Never let it go sold out.\n" +
      "• PLOWHORSE — sells a lot, keeps little. Either raise the price a little or make it cheaper to produce.\n" +
      "• PUZZLE — keeps a lot, hardly sells. Push it: photo, position, mention it at the counter.\n" +
      "• DOG — sells little, keeps little. A candidate to drop, unless it is there for a reason.\n\n" +
      "The point is that they need different actions. Raising the price of a puzzle nobody orders changes nothing.",
  },
  {
    id: "stock",
    group: "The kitchen",
    question: "How does the stock count work?",
    triggers: ["stock", "inventory", "on hand", "sangkap", "natitira", "how much left", "servings", "ilan pa", "how many can i make", "makakagawa", "pwede pa gawin", "makeable"],
    numbers: "stock",
    where: { href: "/admin/inventory", label: "Inventory" },
    answer:
      "Stock moves by itself as you sell. Ring up a dish and its recipe is deducted from the ingredients; cancel it and the stock comes back.\n\n" +
      "'Makeable servings' is the useful number: for each dish, how many more you could make with what is on the shelf right now. It is limited by whichever ingredient runs out first — twenty portions of noodles and two eggs means two servings, not twenty.\n\n" +
      "When a dish falls to zero makeable servings it is marked sold out on the website automatically, so nobody orders what you cannot cook.",
  },
  {
    id: "restock",
    group: "The kitchen",
    question: "How do I record a delivery / restock?",
    triggers: ["restock", "delivery of supplies", "bumili", "pumalengke", "bought ingredients", "add stock", "resupply", "supplier", "record a delivery", "delivery of ingredients", "bought stock", "received stock", "new stock", "papalitan ng stock"],
    where: { href: "/admin/inventory", label: "Inventory" },
    answer:
      "Inventory → find the ingredient → Restock.\n\n" +
      "Put in how much you bought and what you paid IN TOTAL for that amount. The unit price is worked out from that, so you can type what is on the receipt instead of doing arithmetic at the market.\n\n" +
      "That new price becomes the cost used for dishes made from then on. Orders already sold keep the price they were sold at — a price rise should not rewrite last week's profit.\n\n" +
      "If the delivery has an expiry date, add it. Expiring lots are flagged before they turn into waste.",
  },
  {
    id: "batch",
    group: "The kitchen",
    question: "How do I cook a batch (sauce, marinade)?",
    triggers: ["batch", "sauce", "marinade", "niluto", "prep", "cook ahead", "produce", "sabaw"],
    where: { href: "/admin/inventory", label: "Inventory" },
    answer:
      "A batch is something you make once and use across many dishes — the black pepper sauce, a marinade.\n\n" +
      "Give it a recipe once. Then 'Produce a batch' deducts all its ingredients in one go and adds the finished batch to stock, priced at what those ingredients actually cost.\n\n" +
      "Dishes that use it then draw from the batch rather than from raw ingredients, so the cost of a plate includes its share of the sauce without you working it out each time.",
  },
  {
    id: "waste",
    group: "The kitchen",
    question: "How do I log waste, and why does it matter?",
    triggers: ["waste", "spoiled", "nasira", "expired", "throw away", "itinapon", "basura", "sayang", "spoiled food", "wasted food", "napanis", "food thrown"],
    where: { href: "/admin/inventory", label: "Inventory" },
    answer:
      "Inventory → the ingredient → Waste. Say how much and why (spoiled, dropped, staff meal).\n\n" +
      "It matters for two reasons. It takes the stock off the shelf so your counts stay true — and it costs the waste at what you actually paid, so you can see what spoilage is costing you a month.\n\n" +
      "That figure is fed into break-even, treated as an ongoing cost the same as rent. Waste you do not record does not disappear; it just shows up later as stock that is missing and profit that is lower than it should be.",
  },
  {
    id: "packaging",
    group: "The kitchen",
    question: "How do dine-in and take-out differ in cost?",
    triggers: ["packaging", "take out", "takeout", "dine in", "dinein", "balot", "container", "supot", "box"],
    where: { href: "/admin/costing", label: "Dish costs" },
    answer:
      "Dine-in is the one case where nothing leaves the stall, so nothing is spent on packaging.\n\n" +
      "Every dish can have packaging attached — a box, a cup, a bag — and an order can have packaging of its own, charged once for the whole order rather than per dish. Both are added to cost only when the order is take-out or delivery.\n\n" +
      "That is why the same dish can show two different margins. Dine-in keeps more, and now you can see exactly how much more.",
  },

  // ---------------- Every day ---------------------------------------
  {
    id: "today",
    group: "Every day",
    question: "What is the Today screen showing me?",
    triggers: ["today", "dashboard", "ngayon", "home screen", "first screen", "summary"],
    numbers: "today",
    where: { href: "/admin", label: "Today" },
    answer:
      "Today is the shift at a glance: what has been taken so far, how many orders are still open, who is on shift, and anything that needs a decision.\n\n" +
      "It counts today only, from midnight Manila time, and it counts cancelled orders as nothing — they earned nothing and cost nothing.",
  },
  {
    id: "counter",
    group: "Every day",
    question: "How do I ring up a walk-in customer?",
    triggers: ["counter", "till", "walk in", "walkin", "cashier", "kaha", "ring up", "sukli", "change calculator"],
    where: { href: "/admin/counter", label: "Counter" },
    answer:
      "Counter is the till. Tap the dishes, and the order is recorded exactly like an online one — so stock moves, profit is counted, and it shows in the day's takings.\n\n" +
      "Say whether it is dine-in or take-out. That decides whether packaging is charged.\n\n" +
      "For change: type what the customer handed you and the sukli is worked out for you. There are quick buttons for the usual notes, and it will tell you plainly if what they gave is short.",
  },
  {
    id: "orders",
    group: "Every day",
    question: "How do I move an order along?",
    triggers: ["order board", "orders", "preparing", "ready", "completed", "status", "queue", "pila"],
    where: { href: "/admin/orders", label: "Orders" },
    answer:
      "Orders is the board: new → preparing → ready → completed.\n\n" +
      "Moving one to 'preparing' tells the customer their food has started, and starts the ETA. Ready means they can collect. Completed closes it and folds it away so the board stays short.\n\n" +
      "Cancelling puts the ingredients back on the shelf. That is the point of doing it here rather than just ignoring the order.",
  },
  {
    id: "sold-out",
    group: "Every day",
    question: "How do I mark a dish sold out?",
    triggers: ["sold out", "soldout", "ubos", "unavailable", "hide dish", "out of stock", "wala na"],
    where: { href: "/admin/menu", label: "Menu" },
    answer:
      "Menu → the dish → the availability switch. It disappears from the website immediately and comes back the same way.\n\n" +
      "It also happens by itself: when the ingredients for a dish run out, it is marked sold out automatically. So the usual reason to do it by hand is something the system cannot know — the fryer is down, or you have simply stopped making it today.\n\n" +
      "A manager can do this. It is the one part of the Menu screen they can touch; prices and photos stay with you.",
  },
  {
    id: "promo-run",
    group: "Every day",
    question: "How do I run a promo on the website?",
    triggers: ["promo", "promotion", "announcement", "news", "post", "banner", "advertise", "ipost", "balita"],
    where: { href: "/admin/promos", label: "Promos & news" },
    answer:
      "Promos & news. Four things live there:\n" +
      "• PROMO — scrolls across the top of the homepage, and shows as a card\n" +
      "• NEWS — dated, opens to its own page. A closure, a new dish\n" +
      "• DINE-IN SPECIAL — the big line in the gold band\n" +
      "• COMING SOON — the line under it\n\n" +
      "Any of them can carry a photo or a short video. Give it an end date and it takes itself off the homepage that night — which is the whole point: a promo you have to remember to switch off is a promo that stays up, and a customer arrives on Tuesday with a screenshot of a deal that ended on Sunday.",
  },
  {
    id: "inbox",
    group: "Every day",
    question: "How do I reply to a customer?",
    triggers: ["inbox", "chat", "message", "reply", "sagot", "customer question", "ask pepper pan"],
    where: { href: "/admin/inbox", label: "Inbox" },
    answer:
      "Inbox holds every conversation from the website's chat. Ask Pepper Pan answers the easy ones by itself — hours, prices, delivery, where you are — and anything it cannot answer waits for you.\n\n" +
      "Take over a thread and type; the customer sees it live. If it is a question you will be asked again, use 'Teach this answer' and Ask Pepper Pan will handle it next time.",
  },

  // ---------------- People ------------------------------------------
  {
    id: "roles",
    group: "People",
    question: "What can staff and managers see?",
    triggers: ["role", "staff", "manager", "permission", "access", "makikita", "trabahador", "empleyado", "who can see"],
    where: { href: "/admin/staff", label: "Staff" },
    answer:
      "Three levels, and the difference is money.\n\n" +
      "• STAFF — the counter, the orders, the inbox. Sees what stock is left and can log waste. NO prices, NO costs, NO takings.\n" +
      "• MANAGER — all of that, plus restocking, recipes, cooking batches, marking a dish sold out, and posting promos and answers. Still cannot see what anything earns or change a price.\n" +
      "• OWNER — everything, including this assistant.\n\n" +
      "This is not just hidden buttons. The database itself refuses: even if someone got at the data directly, a staff account cannot read your costs.",
  },
  {
    id: "shifts",
    group: "People",
    question: "How do shifts and clocking in work?",
    triggers: ["shift", "clock in", "clockin", "clock out", "attendance", "pasok", "uwi", "duty", "hours worked"],
    where: { href: "/admin/staff", label: "Staff" },
    answer:
      "Whoever is working taps Clock in when they start and Clock out when they leave. HQ shows who is on shift live, without anyone refreshing.\n\n" +
      "Each finished shift records how long it ran and what was rung up during it — so you can see what a shift actually took, not just that somebody was here.\n\n" +
      "Shifts are in your backup. They are the record you would need if a wage was ever disputed.",
  },
  {
    id: "add-staff",
    group: "People",
    question: "How do I add someone or change their role?",
    triggers: ["add staff", "new employee", "change role", "promote", "bagong tauhan", "hire", "make manager"],
    where: { href: "/admin/staff", label: "Staff" },
    answer:
      "They sign up on the website as an ordinary customer first. Then on Staff, find them and set their role to staff or manager.\n\n" +
      "Do it the other way round — setting the role before they have signed up — and there is no account to attach it to.\n\n" +
      "Change it back to customer when somebody leaves. That removes their access immediately, without deleting the shifts they worked.",
  },

  // ---------------- Setting up --------------------------------------
  {
    id: "hours",
    group: "Setting up",
    question: "How do I change opening hours or close for a day?",
    triggers: ["hours", "opening", "closing", "oras", "sarado", "closed", "holiday", "schedule"],
    where: { href: "/admin/hours", label: "Hours" },
    answer:
      "Hours sets the week — open and close for each day, or closed entirely.\n\n" +
      "For a one-off, add a closure with its date instead of editing the week and having to remember to put it back. The website shows it, Ask Pepper Pan tells customers about it, and it undoes itself.",
  },
  {
    id: "delivery",
    group: "Setting up",
    question: "How is the delivery fee decided?",
    triggers: ["delivery", "fee", "hatid", "padala", "rider", "distance", "singil sa hatid", "shipping"],
    where: { href: "/admin/delivery", label: "Delivery" },
    answer:
      "You set a base fee and a rate per kilometre, plus how far you are willing to go.\n\n" +
      "At checkout the customer's distance is worked out from their pin and the fee follows from it — so it is the same rule for everybody and nobody has to argue at the door. Beyond your limit, delivery is simply not offered.",
  },
  {
    id: "payments",
    group: "Setting up",
    question: "How does GCash payment work?",
    triggers: ["gcash", "payment", "bayad", "qr", "reference", "cod", "cash on delivery", "downpayment", "paano magbayad"],
    where: { href: "/admin/payments", label: "Payments" },
    answer:
      "Two screens, deliberately named apart. PAYMENTS is how customers pay you — your GCash name, number and QR. COSTS & CASH is what you pay out.\n\n" +
      "A customer paying by GCash sends the reference number after paying. It lands on Payments waiting for you to confirm, and the order is not treated as paid until you do.\n\n" +
      "Order-ahead has to be paid before it is cooked. That is on purpose — food cooked for somebody who never arrives is a loss you cannot undo.",
  },
  {
    id: "alerts",
    group: "Setting up",
    question: "What are the alerts, and why do I miss them?",
    triggers: ["alert", "notification", "push", "abiso", "notify", "eta", "warning"],
    where: { href: "/admin/alerts", label: "Alerts" },
    answer:
      "Alerts tell you about a new order, and warn you when an order's ETA has run out.\n\n" +
      "Push notifications need permission from the browser once, on each device you want them on. Install the site to your phone's home screen and they behave like a normal app's.\n\n" +
      "One honest limitation: the ETA warning needs an HQ tab open somewhere. If every device is closed, nothing is watching the clock.",
  },
  {
    id: "backup",
    group: "Setting up",
    question: "How do I back up, and how often?",
    triggers: ["backup", "back up", "export", "download data", "kopya", "save data", "restore", "lost data"],
    where: { href: "/admin/backup", label: "Backup" },
    answer:
      "Backup downloads one file with everything: orders, menu, recipes, ingredients, shifts, promos, answers, customers.\n\n" +
      "Do it once a month, and keep the file somewhere that is not the same computer — email it to yourself, or put it in Drive.\n\n" +
      "This is the one thing nothing else can replace. Your website can be rebuilt from the code; the record of what you sold cannot be rebuilt from anywhere.",
  },
  {
    id: "reset",
    group: "Setting up",
    question: "How do I clear the test data?",
    triggers: ["reset", "start fresh", "clear", "delete everything", "burahin", "test data", "clean slate"],
    where: { href: "/admin/reset", label: "Start fresh" },
    answer:
      "Start fresh clears the practice orders and messages so you open with a clean set of books. It is behind a password because it cannot be undone.\n\n" +
      "Take a backup first. Not because you expect to need it — because the one time you do, it is too late to go back and take one.",
  },
  {
    id: "answers-faq",
    group: "Setting up",
    question: "How do I change what the website says in its FAQ?",
    triggers: ["faq", "answers", "frequently asked", "homepage question", "sagot sa tanong", "teach answer"],
    where: { href: "/admin/faq", label: "Answers" },
    answer:
      "Answers is one list used in two places. Anything you write there, Ask Pepper Pan says word for word — and it says it before its own built-in answers, so it is also how you correct one it gets wrong.\n\n" +
      "Tick 'Show on the homepage' and the same answer is printed in the FAQ at the bottom of the homepage. One answer, two places, so they can never end up disagreeing.\n\n" +
      "You and your manager can edit these. Staff cannot — it is the shop speaking in public.",
  },
];
