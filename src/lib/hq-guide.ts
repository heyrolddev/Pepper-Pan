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
  | "today"
  | "pots"
  | "supplier_utang"
  | "running_costs";

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

function normalize(text: string): string {
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

function speaksTaglish(text: string): boolean {
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
      "• monthly fixed costs\n" +
      "• + a month's worth of waste\n" +
      "• + a month's worth of running costs — gas, supplies, repairs\n" +
      "• ÷ your margin (the share of each peso left after ingredients)\n" +
      "• ÷ days you open per month\n\n" +
      "Dividing by the margin is the step people skip. If only 60 centavos of each peso survives the ingredients, you have to sell ₱1.67 to cover every ₱1 of rent — not ₱1.\n\n" +
      "Running costs were added to this sum later than the rest, and the reason is worth knowing: before that, the target was too low every single day, and nothing on the screen could have shown it — because the sum it appeared in was self-consistent.",
  },
  {
    id: "cash",
    group: "Money",
    question: "How is 'cash in the drawer' worked out?",
    triggers: ["cash on hand", "cash", "drawer", "pera", "laman ng kahon", "kaha", "cash balance", "cash in the drawer"],
    numbers: "cash",
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "Cash in the drawer is what should be in the physical box right now:\n" +
      "• the amount you started with, on the date you set\n" +
      "• plus every sale rung up as CASH\n" +
      "• plus or minus anything you recorded in the ledger against the drawer\n\n" +
      "GCash and Bank are counted exactly the same way, but each in its own pot, and neither is folded in here. The drawer earns its keep by being checkable against a physical count, and adding a balance nobody can count would destroy the one self-correcting number on the screen.\n\n" +
      "If the real drawer and this number disagree, that gap is the useful part — it is usually an unrecorded 'labas' for supplies. Add it to the ledger and they agree again.",
  },
  {
    id: "pots",
    group: "Money",
    question: "Cash, GCash and Bank — why three, and what is the total?",
    triggers: [
      "pots", "three pots", "gcash balance", "bank", "bpi", "total money",
      "magkano lahat ng pera", "pepper pan bank", "e wallet", "ewallet",
      "how much money do i have", "total held", "bank balance", "saang pera",
    ],
    numbers: "pots",
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "The shop's money sits in three pots, and each one is counted the same way: an opening figure on a date you set, plus what the till took into it, plus or minus whatever you recorded moving.\n\n" +
      "• CASH IN THE DRAWER, in green — the physical notes\n" +
      "• GCASH, in blue — the e-wallet\n" +
      "• BANK — what was transferred to the account\n\n" +
      "They are kept apart rather than added into one figure because only the drawer can be checked against a physical count, and that check is the one thing in here that corrects itself. The total is shown as a total.\n\n" +
      "At the counter you say how each order was paid, so it lands in the right pot with nobody sorting it out afterwards. Rung up wrong? On Orders or on Payments, change how that order was paid. Every pot is worked out afresh from the orders each time the screen loads, so the money simply moves from one sum to the other — no correcting entry, and no chance of the fix and the order disagreeing a month later.\n\n" +
      "One thing the total does NOT do is take off what you owe suppliers. Those pesos really are in the drawer. The screen shows both figures and the subtraction, so you can see what you are holding and what is actually yours.",
  },
  {
    id: "supplier-utang",
    group: "Money",
    question: "Utang sa supplier — what does the shop owe?",
    triggers: [
      "utang sa supplier", "supplier debt", "owe supplier", "owed to suppliers",
      "may utang ako sa", "unpaid delivery", "hindi pa bayad sa supplier",
      "credit from supplier", "pay supplier", "bayaran ang supplier", "i owe",
      "what do i owe", "lista sa tindahan",
    ],
    numbers: "supplier_utang",
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "This is the opposite direction to the other Utang panel. That one is customers who owe you; this is what YOU owe.\n\n" +
      "It fills itself. Record a delivery — or a spend — and choose 'Not yet paid', and the debt is written here with the supplier's name frozen onto it, so renaming or removing the supplier later cannot erase who you owed.\n\n" +
      "Paying is one tap for the whole thing, one tap for half, or a box for any other amount. THAT is the moment the money leaves a pot — not the delivery. The cash genuinely is still in the drawer until the supplier is actually paid, and a ledger line written at delivery time would make the drawer fail a physical count.\n\n" +
      "The stock arrives either way. Buying on credit moves goods without moving money, and both halves of that are recorded.",
  },
  {
    id: "running-costs",
    group: "Money",
    question: "Gamit at gastos — where do supplies, gas and repairs go?",
    triggers: [
      "running cost", "gamit at gastos", "supplies", "paper towel", "alcohol",
      "repair", "batteries", "consumable", "hindi sangkap", "non ingredient",
      "gastos na hindi sangkap", "spend", "nagastos", "walis", "sabon",
    ],
    numbers: "running_costs",
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "Three kinds of money leave a food business, and they are not the same thing.\n\n" +
      "• INGREDIENTS become a dish. Measured per serving — which is exactly what makes an order's COGS a fact rather than an estimate. They live in Inventory.\n" +
      "• ASSETS are money turned into a thing that is still there afterwards: a freezer, a storage box, the cart. Not a cost at all. The question they answer is payback.\n" +
      "• RUNNING COSTS are used up and gone with nothing to show for them — paper towels, alcohol, batteries, a gas refill, a wok repair. Those go in Gamit at gastos.\n\n" +
      "That third kind is the one that had nowhere to go, so it went nowhere. They are not fixed costs, because they do not arrive on the first of the month, and they are not ingredients, because no recipe uses them.\n\n" +
      "Now they are averaged into a monthly rate and added into break-even beside waste — so the daily target finally includes them.",
  },
  {
    id: "gas-tank",
    group: "Money",
    question: "How does it know when the gas will run out?",
    triggers: [
      "gas", "lpg", "tangke", "tank", "kailan mauubos ang gas", "refill",
      "22kg", "11kg", "gas due", "gas tank", "when will the gas run out",
    ],
    where: { href: "/admin/money", label: "Costs & cash" },
    answer:
      "From the dates, not from a stock level.\n\n" +
      "Gas looked like an obvious ingredient: it has a quantity, it runs out, and running out stops the shop. But an ingredient earns its place by being consumed in a MEASURED amount per dish, and nobody can weigh the gas that went into one bowl. Making it one would have put a guess inside every COGS figure downstream, to buy a stock level nobody could keep accurate anyway.\n\n" +
      "So instead: record each refill with its size — 22kg, 11kg — and what it cost. The gap between refills of the same size IS the usage. Two of a size and there is an estimate; from there it sharpens on its own, and a busy month shortens it without anybody adjusting a setting.\n\n" +
      "That also handles the two things that made this awkward. The price moves between refills, which is fine, because every purchase carries its own amount. And a tank does not last a fixed number of days — which is the whole point of measuring it this way.",
  },
  {
    id: "marketing-calc",
    group: "Money",
    question: "Did the ads / promo / free taste actually pay?",
    triggers: [
      "marketing", "ads", "advertising", "roas", "campaign", "boosted post",
      "free taste", "giveaway", "libre", "discount", "tawad", "sulit ba",
      "did the promo work", "marketing calculator", "budget for ads",
      "worth it ba", "kumita ba ang promo",
    ],
    where: { href: "/admin/promos", label: "Promos & news" },
    answer:
      "The calculator at the top of Promos & news. It works both ways round: BEFORE you spend, to see what the campaign would have to bring in; AFTER, to see whether it did.\n\n" +
      "Three traps it is built to keep you out of.\n\n" +
      "1. COUNTING ALL THE SALES. \"We spent ₱2,000 and took ₱18,000\" is not a result — the shop would have taken something that week anyway. Only the gap above a usual day counts, so the baseline is a required box rather than a refinement.\n\n" +
      "2. COUNTING SALES INSTEAD OF PROFIT. ₱10,000 of extra noodles is not ₱10,000 of extra money; those ingredients still had to be bought. Which gives the one number worth knowing before you spend anything — break-even ROAS = 1 ÷ your margin. At a 60% margin, every peso of ad money has to bring back ₱1.67 of sales just to stand still.\n\n" +
      "3. TREATING A DISCOUNT AS A CASH COST. It isn't one. It costs margin, and it costs it on every sale including the ones that would have happened anyway. Twenty per cent off a 60%-margin dish does not leave 40% of the margin — it leaves 40 points out of 60, which is two thirds. You then need half again as many sales just to end up where you started.\n\n" +
      "It will also tell you \"too close to call\". Sales move on their own, so an uplift smaller than the shop's ordinary day-to-day swing is not a marketing result, and saying so is more honest than a confident number that is really a coin flip.\n\n" +
      "\"See the calculation\" shows every step in order. If one line looks wrong, that is the box to change.",
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
      "3. WHO CHANGED WHAT — the History tab. Every restock, price change, count, cancellation and peso moved, in order, with the name of whoever did it. Narrow it to a date range or to one kind and read what actually happened that day.\n\n" +
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
      "The rule of thumb for a stall is to keep food cost at or under 30%. Above 40% and the dish is working for the supplier, not for you. A dish with no recipe yet shows as uncosted rather than as free — an unknown cost is not a zero cost.\n\n" +
      "The selling price is edited on this same screen, right beside the cost. That is deliberate: the only sensible moment to decide a price is the moment you can see what the plate costs and what it would keep.",
  },
  {
    id: "dish-price",
    group: "The kitchen",
    question: "How do I change what a dish sells for?",
    triggers: [
      "change the price", "edit the price", "raise the price", "set the price",
      "taasan ang presyo", "palitan ang presyo", "pricing", "price of a dish",
      "repricing", "magkano ibebenta", "change price", "new price",
    ],
    where: { href: "/admin/costing", label: "Dish costs" },
    answer:
      "On Dish costs, right beside the cost. That is deliberate: the only sensible moment to decide a price is the moment you can see what the plate costs to make and what it would keep.\n\n" +
      "Type a new price and what you keep and the food cost % move with it, before you save. Aim for 30% food cost or under.\n\n" +
      "The change goes into History with your name on it, and orders already sold keep the price they were sold at. Putting a price up does not rewrite last week's profit.\n\n" +
      "There is also a Duplicate button on the same screen. It copies the dish with its recipe and packaging, which is the fast way to add a size or a variant without rebuilding the recipe by hand — then group the two on the Menu tab so they show as one card.",
  },
  {
    id: "menu-cards",
    group: "The kitchen",
    question: "How do I stop the menu looking like it has duplicates?",
    triggers: [
      "menu card", "group dishes", "variant", "variants", "sizes on the menu",
      "duplicate on the menu", "16oz 22oz", "one card", "grouping",
      "doble sa menu", "pagsamahin ang dish", "with cheese option",
      "spicy option", "clickable menu", "options on the menu",
    ],
    where: { href: "/admin/menu", label: "Menu" },
    answer:
      "Menu → Menu cards → Group dishes.\n\n" +
      "The 16oz and the 22oz latte are two dishes in here and one thing to a customer. Grouped, the menu shows ONE card that opens: the sizes as buttons, the right price and the right photo for whichever is tapped, and a sold-out size greyed out instead of missing.\n\n" +
      "The dishes themselves do not change. Each keeps its own price, its own recipe, its own cost, its own stock and its own sales history — which is the point, because a 22oz really does use more milk and a bigger cup. Grouping only changes how they are SHOWN. Ungroup and they are separate cards again.\n\n" +
      "The form fills itself in from the names you already use, so grouping a pair is usually a glance and a tap. Correct anything it got wrong — it is guessing from words, and it will sometimes guess badly.\n\n" +
      "Two choices at once are fine. Flavour (Original / Spicy) and Cheese (with / without) give four combinations, and only the ones that exist as real dishes can be picked — so a customer cannot order something you do not make.",
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
      "When a dish falls to zero makeable servings it is marked sold out on the website automatically, so nobody orders what you cannot cook.\n\n" +
      "Finding things: the search box at the top looks through ingredients and batches at once, and anything hidden always sorts to the bottom rather than in among what you actually use. Each ingredient and batch carries its own History button too, for the question \"what happened to the chicken on Tuesday\".",
  },
  {
    id: "restock",
    group: "The kitchen",
    question: "How do I record a delivery / restock?",
    triggers: ["restock", "delivery of supplies", "bumili", "pumalengke", "bought ingredients", "add stock", "resupply", "record a delivery", "delivery of ingredients", "bought stock", "received stock", "new stock", "papalitan ng stock"],
    where: { href: "/admin/inventory", label: "Inventory" },
    answer:
      "Inventory → find the ingredient → Restock.\n\n" +
      "Put in how much you bought and what you paid IN TOTAL for that amount. The unit price is worked out from that, so you can type what is on the receipt instead of doing arithmetic at the market.\n\n" +
      "Two more taps and it is a complete record. WHO you bought from is a chip off your supplier list, so nobody has to spell the name again. HOW you paid picks the pot it came out of — cash, GCash, bank, or 'Not yet paid', which takes nothing out of any pot and files the amount under Utang sa supplier instead.\n\n" +
      "That new price becomes the cost used for dishes made from then on. Orders already sold keep the price they were sold at — a price rise should not rewrite last week's profit.\n\n" +
      "If the delivery has an expiry date, add it. Expiring lots are flagged before they turn into waste.",
  },
  {
    id: "suppliers",
    group: "The kitchen",
    question: "What is the Suppliers tab for?",
    triggers: [
      "supplier list", "suppliers", "tindahan", "saan bumili", "where to buy",
      "supplier number", "contact of supplier", "palengke", "vendor",
      "suppliers tab", "add a supplier",
    ],
    where: { href: "/admin/suppliers", label: "Suppliers" },
    answer:
      "Who you buy from, how to reach them, where they are, and what they sell.\n\n" +
      "Once somebody is on that list, recording a delivery is a tap instead of typing their name again — which is how one supplier ends up spelled three ways and its purchase history split into three.\n\n" +
      "Staff and managers can see it, because the person standing in front of the empty shelf is rarely you, and the phone number is most useful to them. Adding and editing stays with you and your manager.\n\n" +
      "Stop buying somewhere? Mark them inactive rather than removing them. They drop out of the chips at restock time, and every delivery you already recorded still points at a name that exists.",
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
      "Dishes that use it then draw from the batch rather than from raw ingredients, so the cost of a plate includes its share of the sauce without you working it out each time.\n\n" +
      "A batch also has a Count and a History of its own, the same as an ingredient — which matters, because a batch is the thing most likely to drift. A little more sauce comes out one day than the yield says it should.",
  },
  {
    id: "batch-in-batch",
    group: "The kitchen",
    question: "Can a batch be made from another batch?",
    triggers: [
      "batch inside", "batch in a batch", "sub batch", "liquid butter",
      "ji pai", "batch of a batch", "batch ingredient", "batch sa batch",
      "nested batch", "another batch", "batch within", "batch sa loob",
      "made from a batch",
    ],
    where: { href: "/admin/inventory", label: "Inventory" },
    answer:
      "Yes. A line in a batch recipe can point at an ingredient off the shelf OR at another batch — liquid butter inside the marinated ji pai.\n\n" +
      "Before that, the only way to say it was to re-list every ingredient of the butter inside the ji pai recipe. Which costed the butter twice in two places, hid the fact that the butter specifically was running out, and left the ji pai quietly wrong the day the butter recipe changed.\n\n" +
      "Making the ji pai CONSUMES butter that already exists. It does not go and make the butter first. That is the real kitchen behaviour, and it is also what makes the whole thing safe: running out of butter fails in exactly the way running out of chicken fails, rather than setting something running in circles.\n\n" +
      "Costing does follow the chain, because the cost of ji pai per gram depends on the cost of butter per gram. Nothing is counted twice — the butter's own ingredients were already spent at the moment the butter was made.",
  },
  {
    id: "count",
    group: "The kitchen",
    question: "The number is wrong. How do I correct the stock?",
    triggers: [
      "count", "bilang", "adjust stock", "mali ang bilang", "recount",
      "correct the stock", "actual count", "edit the stock", "fix inventory",
      "stock is wrong", "hindi tugma ang stock",
    ],
    where: { href: "/admin/inventory", label: "Inventory" },
    answer:
      "Inventory → the ingredient or the batch → Count. Type what is ACTUALLY there.\n\n" +
      "It shows you the difference and what that difference cost, and then asks the question that matters: was the food real and is now gone, or was the book simply wrong?\n\n" +
      "Only the first is a write-off. A write-off is costed and reaches your spoilage figure and your break-even; a correction does not, because charging the shop for a bookkeeping slip would quietly inflate the one number you use to judge the kitchen.\n\n" +
      "Count more often than feels necessary on the two or three ingredients that cost the most. Those are the ones where being wrong is expensive.",
  },
  {
    id: "waste",
    group: "The kitchen",
    question: "How do I log waste, and why does it matter?",
    triggers: ["waste", "spoiled", "nasira", "expired", "throw away", "itinapon", "basura", "sayang", "spoiled food", "wasted food", "napanis", "food thrown"],
    where: { href: "/admin/inventory", label: "Inventory" },
    answer:
      "Inventory → the ingredient or batch → Waste. Say how much, and which of the two it was.\n\n" +
      "The toggle at the top is the whole point. WASTE is spoiled, spilt, burnt, dropped, past its date. INTERNAL USE is a staff meal, a tasting, a sample for a customer, a photo shoot. Both cost money, but only one of them is a problem — and a single figure that mixes them is either an unfair indictment of your kitchen or a hiding place for real spoilage, depending which way the mix runs.\n\n" +
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
      "Then say how they paid — Cash, GCash or Bank. That is the button that puts the money in the right pot, so nobody has to reconcile it later. Nothing is chosen for you, on purpose: it used to open on Cash, which is right most of the time and therefore exactly the problem — a GCash sale rung up in a hurry stayed cash. Cash brings up the change calculator; GCash and Bank ask for the reference instead.\n\n" +
      "For change: type what the customer handed you and the sukli is worked out for you. There are quick buttons for the usual notes, and it will tell you plainly if what they gave is short.",
  },
  {
    id: "counter-badges",
    group: "Every day",
    question: "What do the badges on the counter buttons mean?",
    triggers: [
      "badge", "no stock", "no recipe", "counter only", "grey badge",
      "walang badge", "bakit walang", "why no badge", "sold out badge",
      "what does the badge mean", "anong ibig sabihin ng badge",
    ],
    where: { href: "/admin/counter", label: "Counter" },
    answer:
      "Four things a dish button can tell you, and they are four different problems.\n\n" +
      "• NOTHING AT ALL — plenty on the shelf. Carry on.\n" +
      "• \"5 LEFT\", in gold — five or fewer servings' worth of ingredients. Time to think about restocking.\n" +
      "• \"NO STOCK · WHY?\", in red — something in the recipe has run out. Tap it and it names which ingredient, how much you needed and how much you had.\n" +
      "• \"NO RECIPE\", in grey — this is the one worth understanding. It does NOT mean there is none left. It means the dish has no recipe, so nothing can be worked out about it: no stock count, no cost, no margin. It used to show no badge at all, which looked exactly like \"plenty\".\n\n" +
      "\"COUNTER ONLY\" is separate from all four — the dish is hidden from the website, but you can still ring it up here.\n\n" +
      "So a grey badge is a job, not a warning. Give the dish a recipe and it starts telling you the truth.",
  },
  {
    id: "history",
    group: "Every day",
    question: "Where can I see everything that happened?",
    triggers: [
      "history", "activity", "audit", "kasaysayan", "what happened",
      "anong nangyari", "who changed", "sino nag", "timeline",
      "record of changes", "activity log", "history tab",
    ],
    where: { href: "/admin/history", label: "History" },
    answer:
      "History. Every restock, price change, count, cancelled order, batch made, shift clocking in and peso moved, in the order it happened, with the name of whoever did it.\n\n" +
      "The newest three sit on the page; \"See everything\" opens the rest, folded by day with today already open. Narrow it by date range, or by kind — orders, inventory, movement, menu, money, staff.\n\n" +
      "This is the screen to open when a number looks wrong and you want to know what touched it. Owner and manager only: it is the business's diary.\n\n" +
      "Every ingredient and every batch also has its own History button in Inventory, which is this same log filtered down to that one thing.",
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
      "Cancelling puts the ingredients back on the shelf. That is the point of doing it here rather than just ignoring the order.\n\n" +
      "If an order was rung up as cash and the customer actually paid by GCash, change it here. The pots are worked out from the orders themselves, so the money moves from one to the other on the next load — no correcting entry, and the order stops claiming the wrong thing. Owner and manager only, and it is written into History both ways round.",
  },
  {
    id: "sold-out",
    group: "Every day",
    question: "How do I mark a dish sold out?",
    triggers: ["sold out", "soldout", "ubos", "unavailable", "hide dish", "out of stock", "wala na"],
    where: { href: "/admin/menu", label: "Menu" },
    answer:
      "Menu → the dish → the availability switch. On the website it turns grey and says SOLD OUT straight away, and comes back the same way.\n\n" +
      "It used to disappear from the menu altogether. It stays and says so now, because of grouped cards: a hidden 22oz would tell the customer you only do one size, where what you want to say is that you do two and one has gone today. To take something off the menu entirely rather than mark it sold out, use the other switch — hidden.\n\n" +
      "It also happens by itself: when the ingredients for a dish run out, it is marked sold out automatically. So the usual reason to do it by hand is something the system cannot know — the fryer is down, or you have simply stopped making it today.\n\n" +
      "A manager can do this. It is the one part of the Menu screen they can touch; prices and photos stay with you.",
  },
  {
    id: "promo-run",
    group: "Every day",
    question: "How do I run a promo on the website?",
    triggers: ["promo", "promotion", "announcement", "news", "post", "banner", "advertise", "ipost", "balita", "homepage photo", "our story photo", "larawan sa homepage", "change the picture", "add a photo"],
    where: { href: "/admin/promos", label: "Promos & news" },
    answer:
      "Promos & news. Five things live there:\n" +
      "• PROMO — scrolls across the top of the homepage, and shows as a card\n" +
      "• NEWS — dated, opens to its own page. A closure, a new dish\n" +
      "• DINE-IN SPECIAL — the big line in the gold band\n" +
      "• COMING SOON — the line under it\n" +
      "• OUR STORY PHOTOS — the pictures of the stall further down the homepage\n\n" +
      "Every row has a bin beside Edit. Two taps, because it cannot be undone and the uploaded photo goes with it — if you might run it again next Christmas, turn it off instead and it stays on the list.\n\n" +
      "Any of them can carry a photo or a short video. Give it an end date and it takes itself off the homepage that night — which is the whole point: a promo you have to remember to switch off is a promo that stays up, and a customer arrives on Tuesday with a screenshot of a deal that ended on Sunday.\n\n" +
      "Above them all is the calculator: what a promo, some ads or a free taste would have to bring in, and afterwards whether it did. Worth running before you print the tarpaulin, not after.\n\n" +
      "The story photos are the one thing on that screen that is a picture rather than words. Add a few and they become a deck a customer can swipe through; add none and the homepage keeps the single stall photo it has always had. The caption you type is not printed anywhere — it is what a blind customer's phone reads out instead of showing the picture, so describe what is in it.\n\n" +
      "The order on that list is the order they are dealt, so whichever sits at the top is the one a customer sees first. Move them with the ↑ and ↓ on each row. There is no ★ on a story photo — a deck has a place for every picture, so there is nothing to choose between.",
  },
  {
    id: "inbox",
    group: "Every day",
    question: "How do I reply to a customer?",
    triggers: ["inbox", "chat", "message", "reply", "sagot", "customer question", "ask pepper pan"],
    where: { href: "/admin/inbox", label: "Inbox" },
    answer:
      "Inbox holds every conversation from the website's chat. Ask Pepper Pan answers the easy ones by itself — hours, prices, delivery, where you are — and anything it cannot answer waits for you.\n\n" +
      "Take over a thread and type; the customer sees it live. If it is a question you will be asked again, use 'Teach this answer' and Ask Pepper Pan will handle it next time.\n\n" +
      "You do not have to watch the screen for it. The moment Ask Pepper Pan decides it cannot handle something, the thread is flagged and a notification goes out — so a customer question nobody could answer does not sit unread for six hours. Messenger threads land in the same inbox and raise the same flag.",
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
    triggers: ["gcash", "payment", "bayad", "qr", "reference", "cod", "cash on delivery", "downpayment", "paano magbayad", "how do customers pay"],
    where: { href: "/admin/payments", label: "Payments" },
    answer:
      "Two screens, deliberately named apart. PAYMENTS is how customers pay you — your GCash name, number and QR. COSTS & CASH is what you pay out.\n\n" +
      "A customer paying by GCash sends the reference number after paying. It lands on Payments waiting for you to confirm, and the order is not treated as paid until you do.\n\n" +
      "Order-ahead has to be paid before it is cooked. That is on purpose — food cooked for somebody who never arrives is a loss you cannot undo.\n\n" +
      "At the counter it is simpler: you tap Cash, GCash or Bank as you ring the order up, and the money is filed in that pot straight away. Tapped the wrong one? Change it on Orders or on Payments and the pots follow.",
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
