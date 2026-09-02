import "server-only";
import { loadMoney } from "@/lib/money-server";
import { loadAvailability, loadCostBook, loadSalesVolume } from "@/lib/costing-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { marginFor, peso, pesoRound } from "@/lib/costing";
import type { ExplainKind } from "@/lib/hq-guide";

/**
 * The working, shown with the shop's own numbers.
 *
 * The rule this file follows: never re-derive a figure. Every explanation
 * calls the same function the screen called, then narrates its inputs. A
 * second implementation of "net profit" written here to be explained would
 * drift from the real one within a month, and the explanation would be
 * confidently, invisibly wrong — which for the one question this whole
 * feature exists to answer is worse than saying nothing.
 *
 * So when the calculation changes, this changes with it, because it IS the
 * calculation.
 */

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * A column of figures, with the amounts right-aligned on the decimal.
 *
 * Left-aligned money in a sum is money you have to read digit by digit to
 * check. The whole promise of showing the working is that it can be checked
 * at a glance, and that needs the units under the units.
 */
function sum(rows: [label: string, amount: string, note?: string][]) {
  const labelWidth = Math.max(...rows.map((r) => r[0].length));
  const amountWidth = Math.max(...rows.map((r) => r[1].length));
  return {
    lines: rows.map(
      ([label, amount, note]) =>
        `${label.padEnd(labelWidth)}  ${amount.padStart(amountWidth)}${note ? `   ${note}` : ""}`
    ),
    /**
     * The figures column only.
     *
     * A rule measured from the longest rendered line runs under the little
     * aside in brackets as well, which makes it look like the aside is part
     * of the sum. It isn't.
     */
    rule: "  " + "─".repeat(labelWidth + 2 + amountWidth - 2),
  };
}

/** "over the last 12 trading days" — never "in 30 days" when the shop opened 12. */
const overWindow = (days: number) =>
  `over the last ${days} trading ${days === 1 ? "day" : "days"} you actually opened`;

export async function explain(kind: ExplainKind): Promise<string | null> {
  try {
    switch (kind) {
      case "net_profit":
        return await netProfit();
      case "break_even":
        return await breakEven();
      case "cash":
        return await cash();
      case "utang":
        return await utang();
      case "payback":
        return await payback();
      case "dish_margin":
        return await dishMargin();
      case "stock":
        return await stock();
      case "today":
        return await today();
    }
  } catch (e) {
    // A failed sum must never be presented as a sum. Better to say the
    // numbers could not be read than to print a plausible zero.
    return `I couldn't read your figures just now, so I've left the numbers out rather than guess at them. (${
      e instanceof Error ? e.message : String(e)
    })`;
  }
}

async function netProfit(): Promise<string> {
  const m = await loadMoney();
  if (m.revenue <= 0) {
    return "Your numbers right now: nothing sold yet in the window, so there is no profit to break down. Ring up a few orders and ask me again.";
  }
  const beforeWaste = m.grossProfit - m.oeForWindow;
  const table = sum([
    ["  Revenue", peso(m.revenue)],
    ["− Ingredients (COGS)", peso(m.cogs)],
    ["= Gross profit", peso(m.grossProfit)],
    [
      "− Operating expense",
      peso(m.oeForWindow),
      `(${peso(m.dailyOE)} a day × ${m.windowDays} ${m.windowDays === 1 ? "day" : "days"})`,
    ],
    ["= Before waste", peso(beforeWaste)],
    ["− Waste", peso(m.wasteForWindow)],
    ["= NET PROFIT", peso(m.netProfit)],
  ]);
  return [
    `Your numbers, ${overWindow(m.windowDays)}:`,
    ``,
    table.lines[0],
    table.lines[1],
    table.rule,
    table.lines[2],
    ``,
    table.lines[3],
    table.lines[4],
    ``,
    table.lines[5],
    table.rule,
    table.lines[6],
    ``,
    `The ${peso(m.dailyOE)} a day is your ${peso(m.monthlyFixed)} of monthly fixed costs divided by the ${m.openDays} days a month you open. Every trading day carries that share whether it sells anything or not.`,
    m.netProfit < 0
      ? `\nThis is negative: the food is earning, but not enough to cover the fixed costs on top.`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function breakEven(): Promise<string> {
  const m = await loadMoney();

  if (m.monthlyFixed <= 0) {
    return "You have no fixed costs listed yet, so there is nothing to break even against. Add your rent, electricity and stall fee on Costs & cash and this becomes a real number.";
  }
  if (m.marginRatio === null || m.marginRatio <= 0) {
    return `Your fixed costs are ${peso(
      m.monthlyFixed
    )} a month, but I can't work out a break-even yet: there aren't enough priced sales to know what share of each peso survives the ingredients. Cost a few dishes and sell a few, then ask again.`;
  }

  // Derived FROM the answer, not alongside it. Writing
  // `(fixed + waste) / margin` again here would be a second implementation of
  // the break-even formula, free to drift from the real one — and an
  // explanation that disagrees with the number it is explaining is worse than
  // no explanation.
  const daily = m.breakEvenDaily ?? 0;
  const monthlyTarget = daily * m.openDays;
  const gap = m.avgDailyRevenue - daily;

  const table = sum([
    ["  Fixed costs a month", peso(m.monthlyFixed)],
    ["+ Waste, as a month", peso(m.monthlyWasteRate)],
    ["= To cover every month", peso(m.monthlyFixed + m.monthlyWasteRate)],
  ]);
  return [
    `Your numbers:`,
    ``,
    ...table.lines.slice(0, 2),
    table.rule,
    table.lines[2],
    ``,
    `Of every peso you take, ${pct(m.marginRatio)} survives the ingredients.`,
    `So you must SELL ${peso(m.monthlyFixed + m.monthlyWasteRate)} ÷ ${pct(
      m.marginRatio
    )} = ${peso(monthlyTarget)} a month`,
    ``,
    `÷ ${m.openDays} days open = ${peso(daily)} A DAY.`,
    ``,
    `You are averaging ${peso(m.avgDailyRevenue)} a day ${overWindow(m.windowDays)} — ${
      gap >= 0
        ? `${peso(gap)} above break-even.`
        : `${peso(Math.abs(gap))} SHORT of it.`
    }`,
  ].join("\n");
}

async function cash(): Promise<string> {
  const m = await loadMoney();
  if (!m.cash.enabled || !m.cash.startedOn) {
    return "Cash tracking is switched off, so there is no drawer figure to explain. Turn it on in Costs & cash by saying what was in the drawer and on what date — everything after that is counted from there.";
  }
  const movedIn = m.ledger.filter((l) => l.type === "in").reduce((s, l) => s + l.amount, 0);
  const movedOut = m.ledger.filter((l) => l.type !== "in").reduce((s, l) => s + l.amount, 0);
  const takings = m.cash.onHand - m.cash.startedWith - (movedIn - movedOut);

  const table = sum([
    ["  Started with", peso(m.cash.startedWith)],
    ["+ Cash sales since", peso(takings)],
    ["+ Money put in", peso(movedIn)],
    ["− Money taken out", peso(movedOut)],
    ["= Should be in the drawer", peso(m.cash.onHand)],
  ]);
  return [
    `What should be in the drawer, counting from ${m.cash.startedOn}:`,
    ``,
    ...table.lines.slice(0, 4),
    table.rule,
    table.lines[4],
    ``,
    `GCash is not in there on purpose — that money never went into the drawer, so counting it would make the drawer look permanently over.`,
    ``,
    `If the real drawer says something different, that gap is worth chasing: it is usually a "labas" for supplies that nobody wrote down. Add it to the ledger and the two agree again.`,
  ].join("\n");
}

async function utang(): Promise<string> {
  const m = await loadMoney();
  const open = m.receivables.filter((r) => !r.settled);
  if (open.length === 0) {
    return "Nobody owes you anything right now — every utang on the books is settled.";
  }
  const lines = open
    .slice(0, 8)
    .map(
      (r) =>
        `  • ${r.customer || "(no name)"} — ${peso(r.amount - r.collected)}${
          r.collected > 0 ? `  (${peso(r.amount)} less ${peso(r.collected)} already paid)` : ""
        }`
    );
  return [
    `${open.length} unpaid utang, ${peso(m.owed)} in total:`,
    ``,
    ...lines,
    open.length > 8 ? `  …and ${open.length - 8} more.` : null,
    ``,
    `That total is what is STILL owed — the amount less anything already collected. It is not counted as cash on hand, because you cannot spend it yet.`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function payback(): Promise<string> {
  const m = await loadMoney();
  if (m.assetTotal <= 0) {
    return "You haven't listed what you invested yet. Add the freezer, the pans, the signage and so on under Assets on Costs & cash, set the date to count from, and I can tell you how much of it the shop has earned back.";
  }
  if (!m.payback) {
    return `You have ${peso(
      m.assetTotal
    )} of assets listed, but no date set to count earnings from. Set one on Costs & cash and payback starts tracking.`;
  }
  const left = m.assetTotal - m.payback.earned;
  const table = sum([
    ["  What you put in", peso(m.assetTotal)],
    ["− Earned back since", peso(m.payback.earned)],
    ["= Still to earn back", peso(left), `(${Math.round(m.payback.pct)}% recovered)`],
  ]);
  return [
    `Counting from ${m.payback.from}:`,
    ``,
    ...table.lines.slice(0, 2),
    table.rule,
    m.payback.paidOff ? `  PAID OFF. Everything from here is yours.` : table.lines[2],
    ``,
    `"Earned back" is net — after ingredients, after fixed costs and after waste. It is deliberately the hard number, because the easy one would tell you the shop had paid for itself long before it had.`,
  ].join("\n");
}

async function dishMargin(): Promise<string> {
  const [book, volume] = await Promise.all([loadCostBook(), loadSalesVolume(30)]);

  const all = [...book.mealCosts.values()]
    .filter((mc) => mc.costed && mc.meal.price > 0)
    .map((mc) => ({
      name: mc.meal.name,
      price: mc.meal.price,
      cost: mc.cost,
      m: marginFor(mc.meal.price, mc.cost, mc.costed),
      sold: volume.get(mc.meal.id) ?? 0,
      // Priced, but with holes — an ingredient with no purchase price makes
      // the cost a floor rather than the truth.
      shaky: mc.problems.length > 0 || mc.cost <= 0,
    }))
    .sort((a, b) => b.sold - a.sold);

  const solid = all.filter((r) => !r.shaky);
  const shaky = all.filter((r) => r.shaky);
  const noRecipe = book.mealCosts.size - all.length;

  if (solid.length === 0) {
    return [
      "I can't tell you what any dish earns yet, and I'd rather say that than show you a number that isn't true.",
      "",
      shaky.length > 0
        ? `${shaky.length} ${
            shaky.length === 1 ? "dish has a recipe" : "dishes have recipes"
          } but at least one ingredient in ${
            shaky.length === 1 ? "it" : "them"
          } has no purchase price, so the cost would come out as ₱0 and the dish would look like pure profit.`
        : "No dish has a recipe yet.",
      "",
      "Fix it on Dish costs: give every ingredient a price by recording one restock at what you actually paid. That single hour is the highest-value thing you can do in here — every margin, every break-even and every profit figure depends on it.",
    ].join("\n");
  }

  const top = solid.slice(0, 5);
  const worst = [...solid].sort((a, b) => (b.m.foodCostPct ?? 0) - (a.m.foodCostPct ?? 0))[0];

  return [
    `Your best sellers and what each one keeps:`,
    ``,
    ...top.map(
      (r) =>
        `  • ${r.name} — sells ${pesoRound(r.price)}, costs ${peso(r.cost)}, you keep ${peso(
          r.m.gross
        )} (${Math.round(r.m.foodCostPct ?? 0)}% food cost)`
    ),
    ``,
    `Food cost is the ingredients as a share of the price. Aim for 30% or under; over 40% and the dish is working harder for your supplier than for you.`,
    worst && (worst.m.foodCostPct ?? 0) > 40
      ? `\nThe one to look at is ${worst.name}, at ${Math.round(
          worst.m.foodCostPct ?? 0
        )}%. Either the price is too low or the recipe is too generous.`
      : null,
    shaky.length > 0
      ? `\n${shaky.length} ${
          shaky.length === 1 ? "dish is" : "dishes are"
        } left out because an ingredient in ${
          shaky.length === 1 ? "it has" : "them has"
        } no purchase price — ${shaky
          .slice(0, 3)
          .map((r) => r.name)
          .join(", ")}${
          shaky.length > 3 ? ` and ${shaky.length - 3} more` : ""
        }. ${
          shaky.length === 1 ? "It would show as costing" : "They would show as costing"
        } ₱0, which would make ${
          shaky.length === 1 ? "it look" : "them look"
        } like pure profit.`
      : null,
    noRecipe > 0
      ? `\n${noRecipe} ${noRecipe === 1 ? "dish has" : "dishes have"} no recipe at all yet.`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function stock(): Promise<string> {
  // The same map the menu uses to decide what is sold out, rather than a
  // second count of the same shelves that could disagree with it.
  const [book, can] = await Promise.all([loadCostBook(), loadAvailability()]);
  const nameOf = new Map([...book.mealCosts.values()].map((mc) => [mc.meal.id, mc.meal.name]));

  const rows = [...can.entries()]
    .map(([id, n]) => ({ name: nameOf.get(id) ?? "(deleted dish)", can: n }))
    .sort((a, b) => a.can - b.can);

  if (rows.length === 0) {
    return "No dish has a recipe yet, so I can't work out how many servings you could make. Once a dish has ingredients, this becomes the most useful number on the Inventory screen.";
  }

  const out = rows.filter((r) => r.can <= 0);
  const low = rows.filter((r) => r.can > 0 && r.can <= 3);

  return [
    `What you could still make right now, from what is on the shelf:`,
    ``,
    ...rows.slice(0, 6).map((r) => `  • ${r.name} — ${r.can} serving${r.can === 1 ? "" : "s"}`),
    rows.length > 6 ? `  …and ${rows.length - 6} more.` : null,
    ``,
    out.length > 0
      ? `${out.length} ${out.length === 1 ? "dish is" : "dishes are"} at zero, and marked sold out on the website automatically.`
      : `Nothing is at zero.`,
    low.length > 0
      ? `${low.length} more ${low.length === 1 ? "is" : "are"} down to three or fewer.`
      : null,
    ``,
    `Each number is limited by whichever ingredient runs out first — twenty portions of noodles and two eggs is two servings, not twenty.`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function today(): Promise<string> {
  const supabase = createAdminClient();
  // Manila's day, not the server's. A server in another timezone would
  // otherwise start the shop's day in the middle of its afternoon.
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const { data } = await supabase
    .from("orders")
    .select("revenue, cogs, status")
    .eq("date", date);

  const rows = (data ?? []) as { revenue: number; cogs: number; status: string }[];
  const live = rows.filter((o) => o.status !== "cancelled");
  const revenue = live.reduce((s, o) => s + (Number(o.revenue) || 0), 0);
  const cogs = live.reduce((s, o) => s + (Number(o.cogs) || 0), 0);
  const open = live.filter((o) => !["completed", "cancelled"].includes(o.status)).length;

  if (live.length === 0) {
    return `Nothing rung up yet today (${date}). The Today screen will fill in as orders come through.`;
  }
  const table = sum([
    [
      "  Orders",
      String(live.length),
      rows.length > live.length
        ? `(+${rows.length - live.length} cancelled, which count as nothing)`
        : undefined,
    ],
    ["  Taken", peso(revenue)],
    ["− Ingredients", peso(cogs)],
    ["= Kept so far", peso(revenue - cogs)],
    ["  Still open", String(open)],
  ]);
  return [
    `Today, ${date}:`,
    ``,
    ...table.lines.slice(0, 3),
    table.rule,
    table.lines[3],
    ``,
    table.lines[4],
    ``,
    `"Kept" here is before your daily operating expense. Ask me about net profit for the number that has rent taken out of it.`,
  ].join("\n");
}
