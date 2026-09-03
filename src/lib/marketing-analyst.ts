import "server-only";

/**
 * Turns the shop's own numbers into things to do about them.
 *
 * Every line below traces to a figure in the snapshot — there is no model
 * here, so nothing can be invented. The trade is that the wording is
 * templated: the captions and ad hooks are drafts to edit, not finished copy.
 * What's genuinely derived is the *choice* of what to promote, when, and why.
 */

export type ShopSnapshot = {
  generatedAt: string;
  window: string;
  revenue: { last30: number; prior30: number; avgOrder: number; currency: "PHP" };
  orders: { last30: number; prior30: number; cancelRate: number };
  fulfillment: { pickup: number; delivery: number; dineIn: number; deliveryFees: number };
  payments: { cod: number; gcash: number; unpaidGcash: number };
  customers: { total: number; repeat: number; newLast30: number };
  bestSellers: { name: string; qty: number; revenue: number }[];
  slowMovers: { name: string; qty: number; price: number }[];
  byHour: { hour: number; orders: number }[];
  byWeekday: { day: string; orders: number; revenue: number }[];
  reviews: { count: number; average: number; recent: { rating: number; comment: string }[] };
  questionsAsked: string[];
  freeDeliveryOver: number;
};

export type Advice = {
  headline: string;
  readings: { title: string; detail: string }[];
  ads: { audience: string; hook: string; why: string; budget: string }[];
  social: { day: string; platform: string; idea: string; caption: string }[];
  promos: { name: string; mechanic: string; why: string; watchOut: string }[];
  menu: string[];
};

const peso = (n: number) =>
  "₱" + Number(n).toLocaleString("en-PH", { maximumFractionDigits: 0 });

const FULL_DAY: Record<string, string> = {
  Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday",
};

const NEXT_DAY: Record<string, string> = {
  Sun: "Sat", Mon: "Sun", Tue: "Mon", Wed: "Tue",
  Thu: "Wed", Fri: "Thu", Sat: "Fri",
};

function hourLabel(h: number) {
  const l = h % 12 === 0 ? 12 : h % 12;
  return `${l}${h < 12 ? "am" : "pm"}`;
}

/** The run of consecutive hours holding the most orders. */
function peakWindow(byHour: { hour: number; orders: number }[]) {
  if (byHour.length === 0) return null;
  const map = new Map(byHour.map((h) => [h.hour, h.orders]));
  let best = { start: 0, end: 0, orders: -1 };
  for (let start = 0; start < 24; start++) {
    for (let span = 1; span <= 4; span++) {
      const end = start + span;
      if (end > 24) break;
      let sum = 0;
      for (let h = start; h < end; h++) sum += map.get(h) ?? 0;
      if (sum > best.orders) best = { start, end, orders: sum };
    }
  }
  return best.orders > 0 ? best : null;
}

export async function analyseShop(
  snapshot: ShopSnapshot
): Promise<{ advice: Advice | null; error: string | null }> {
  const s = snapshot;

  const readings: Advice["readings"] = [];
  const ads: Advice["ads"] = [];
  const social: Advice["social"] = [];
  const promos: Advice["promos"] = [];
  const menu: string[] = [];

  const top = s.bestSellers[0] ?? null;
  const second = s.bestSellers[1] ?? null;

  const traded = s.byWeekday.filter((d) => d.orders > 0);
  const bestDay = [...traded].sort((a, b) => b.revenue - a.revenue)[0] ?? null;
  const worstDay = [...traded].sort((a, b) => a.revenue - b.revenue)[0] ?? null;
  const peak = peakWindow(s.byHour);

  const growth =
    s.revenue.prior30 > 0
      ? Math.round(((s.revenue.last30 - s.revenue.prior30) / s.revenue.prior30) * 100)
      : null;

  const repeatPct =
    s.customers.total > 0
      ? Math.round((s.customers.repeat / s.customers.total) * 100)
      : 0;

  const deliveryShare =
    s.orders.last30 > 0 ? Math.round((s.fulfillment.delivery / s.orders.last30) * 100) : 0;

  // ---------------------------------------------------------------- headline
  let headline: string;
  if (bestDay && worstDay && bestDay.day !== worstDay.day && worstDay.revenue > 0 &&
      bestDay.revenue >= worstDay.revenue * 2) {
    headline = `${FULL_DAY[bestDay.day]} earns ${Math.round(bestDay.revenue / worstDay.revenue)}× what ${FULL_DAY[worstDay.day]} does — that gap is where your easiest money is.`;
  } else if (peak) {
    headline = `${peak.orders} of your orders land between ${hourLabel(peak.start)} and ${hourLabel(peak.end)} — that window is your whole business.`;
  } else if (top) {
    headline = `${top.name} carries your menu at ${top.qty} sold — everything else is a supporting act right now.`;
  } else {
    headline = "Not much has sold yet — a week or two of orders will make this a lot more useful.";
  }

  // ---------------------------------------------------------------- readings
  if (growth !== null && Math.abs(growth) >= 5) {
    readings.push({
      title: growth > 0 ? `Sales up ${growth}%` : `Sales down ${Math.abs(growth)}%`,
      detail: `${peso(s.revenue.last30)} in the last 30 days against ${peso(s.revenue.prior30)} in the 30 before. ${
        growth > 0
          ? "Whatever you changed, keep doing it."
          : "Worth looking at what stopped — a dish going off the menu, a quiet week, or fewer posts."
      }`,
    });
  }

  if (bestDay && worstDay && bestDay.day !== worstDay.day) {
    readings.push({
      title: `${FULL_DAY[bestDay.day]} is your day`,
      detail: `${peso(bestDay.revenue)} across ${bestDay.orders} orders, against ${peso(worstDay.revenue)} on ${FULL_DAY[worstDay.day]}. Stock and staff for ${FULL_DAY[bestDay.day]}; use ${FULL_DAY[worstDay.day]} for anything that needs a quiet kitchen.`,
    });
  }

  if (peak) {
    readings.push({
      title: `Your rush is ${hourLabel(peak.start)}–${hourLabel(peak.end)}`,
      detail: `${peak.orders} of your last 30 days' orders came in that window. Anything you post or boost should land 1–2 hours before it, not during — people decide before they're hungry.`,
    });
  }

  if (s.customers.total > 0) {
    readings.push({
      title: `${repeatPct}% come back`,
      detail:
        repeatPct >= 30
          ? `${s.customers.repeat} of ${s.customers.total} customers have ordered more than once. That's a healthy number for a stall — the food is doing its job, so spend on reach, not discounts.`
          : `Only ${s.customers.repeat} of ${s.customers.total} customers have ordered twice. Getting one more order out of people who already know you is cheaper than finding new ones.`,
    });
  }

  if (s.orders.last30 > 0) {
    readings.push({
      title: `${peso(s.revenue.avgOrder)} average order`,
      detail: `${deliveryShare}% of orders are delivery${
        s.fulfillment.deliveryFees > 0
          ? `, bringing ${peso(s.fulfillment.deliveryFees)} in fees that go straight back out to the rider`
          : ""
      }. ${
        s.freeDeliveryOver > 0 && s.revenue.avgOrder < s.freeDeliveryOver
          ? `Your free-delivery line sits at ${peso(s.freeDeliveryOver)} — ${peso(s.freeDeliveryOver - s.revenue.avgOrder)} above what people typically spend, so almost nobody reaches it. Say it louder at checkout, or bring it closer.`
          : "Bundles are the lever here — they lift the average without touching your prices."
      }`,
    });
  }

  if (s.orders.cancelRate >= 10) {
    readings.push({
      title: `${s.orders.cancelRate}% of orders cancel`,
      detail: "That's high enough to be worth a look — usually it's wait times, or people ordering something that turns out to be sold out. Marking items unavailable the moment you run out fixes most of it.",
    });
  }

  if (s.payments.unpaidGcash > 0) {
    readings.push({
      title: `${s.payments.unpaidGcash} GCash payment${s.payments.unpaidGcash === 1 ? "" : "s"} unchecked`,
      detail: "Sitting in Payments waiting for you to confirm. Money you may already have, or may be owed — worth clearing before anything else on this page.",
    });
  }

  if (s.reviews.count >= 3) {
    readings.push({
      title: `${s.reviews.average.toFixed(1)} stars from ${s.reviews.count} reviews`,
      detail:
        s.reviews.average >= 4.5
          ? "Strong enough to put on a poster. Screenshot the best ones — a real customer's words sell harder than anything you write yourself."
          : "Read the ones below 4 stars carefully; a pattern in them is usually one fixable thing.",
    });
  }

  // -------------------------------------------------------------------- ads
  if (top && peak && bestDay) {
    ads.push({
      audience: `People within 5 km of Apalit — boost on ${FULL_DAY[NEXT_DAY[bestDay.day]]} evening`,
      hook: `${top.name}, ${peso(top.revenue / Math.max(top.qty, 1))}. Ready in minutes, ${FULL_DAY[bestDay.day]} sa Pepper Pan.`,
      why: `${FULL_DAY[bestDay.day]} is your best day at ${peso(bestDay.revenue)}, and ${top.name} is what people already choose — boosting the day before puts it in front of them while they're still deciding.`,
      budget: "₱300 over 3 days",
    });
  }

  if (s.fulfillment.delivery > 0 && s.freeDeliveryOver > 0) {
    ads.push({
      audience: "Barangays 3–8 km out, where the delivery fee bites hardest",
      hook: `Libreng delivery pag ${peso(s.freeDeliveryOver)} pataas. Sagot na namin ang hatid.`,
      why: `${deliveryShare}% of your orders are already delivery, and the fee is the thing people hesitate over. This tells them the way around it.`,
      budget: "₱200 over 4 days",
    });
  }

  if (repeatPct < 30 && s.customers.total >= 5) {
    ads.push({
      audience: "Retarget people who visited the site but didn't order",
      hook: `Balik ka na — ${top ? top.name : "black pepper noodles"} pa rin ang paborito dito.`,
      why: `Only ${repeatPct}% of your customers come back. Reaching people who already found you costs far less than finding new ones.`,
      budget: "₱150 over 5 days",
    });
  }

  // ----------------------------------------------------------------- social
  if (top && bestDay) {
    social.push({
      day: NEXT_DAY[bestDay.day],
      platform: "TikTok",
      idea: `Film ${top.name} being made — the pan, the pepper going on, the plating. 15 seconds, no talking, just sound.`,
      caption: `${top.name} 🔥 ${peso(top.revenue / Math.max(top.qty, 1))} lang. Kita-kits ${FULL_DAY[bestDay.day]} sa Pepper Pan! #pepperpan #apalit`,
    });
  }

  if (peak) {
    social.push({
      day: "Wed",
      platform: "Facebook",
      idea: `Post at ${hourLabel(Math.max(peak.start - 2, 0))} — two hours before your rush, while people are still deciding what to eat.`,
      caption: `Gutom na? Bukas na po kami — order na para hindi mahaba ang pila mamaya 🧡`,
    });
  }

  if (second) {
    social.push({
      day: "Thu",
      platform: "Facebook",
      idea: `Put ${top?.name} and ${second.name} side by side and ask people to pick one in the comments.`,
      caption: `Team ${top?.name} o team ${second.name}? Comment kayo 👇`,
    });
  }

  if (s.reviews.recent.length > 0) {
    const kind = s.reviews.recent.find((r) => r.rating >= 4);
    if (kind) {
      social.push({
        day: "Fri",
        platform: "Facebook",
        idea: "Screenshot this review onto a photo of the dish. Real customer words outperform anything you write.",
        caption: `"${kind.comment.slice(0, 120)}" — salamat po! 🧡`,
      });
    }
  }

  if (bestDay) {
    social.push({
      day: bestDay.day,
      platform: "TikTok",
      idea: `Film the ${FULL_DAY[bestDay.day]} rush itself — the queue, the pans going, the pace. Busy looks good.`,
      caption: `${FULL_DAY[bestDay.day]} sa Pepper Pan. Salamat sa lahat ng dumaan 🧡`,
    });
  }

  const slowest = s.slowMovers.find((m) => m.qty === 0) ?? s.slowMovers[0];
  if (slowest) {
    social.push({
      day: "Sun",
      platform: "TikTok",
      idea: `${slowest.name} barely sells — most likely nobody knows what it is. Film someone eating it and reacting.`,
      caption: `Hindi niyo pa natitikman ang ${slowest.name}? ${peso(slowest.price)} lang. Sayang 👀`,
    });
  }

  // ----------------------------------------------------------------- promos
  if (worstDay && bestDay && worstDay.day !== bestDay.day) {
    promos.push({
      name: `${FULL_DAY[worstDay.day]} bundle`,
      mechanic: top && second
        ? `${top.name} + ${second.name} together for about ${peso((top.revenue / Math.max(top.qty, 1) + second.revenue / Math.max(second.qty, 1)) * 0.85)} — ${FULL_DAY[worstDay.day]}s only.`
        : `A two-item bundle at roughly 15% off, ${FULL_DAY[worstDay.day]}s only.`,
      why: `${FULL_DAY[worstDay.day]} brings in ${peso(worstDay.revenue)} against ${peso(bestDay.revenue)} on ${FULL_DAY[bestDay.day]}. A quiet kitchen can absorb a discount; a busy one can't.`,
      watchOut: "Keep it to the one day, in writing. A bundle that quietly runs all week just cuts your margin on the days you'd have sold anyway.",
    });
  }

  if (slowest && top) {
    promos.push({
      name: `Pair ${slowest.name} with the bestseller`,
      mechanic: `Add ${slowest.name} to any ${top.name} order for a reduced price — a small, fixed discount, not a percentage.`,
      why: `${slowest.name} sold ${slowest.qty} in 30 days while ${top.name} sold ${top.qty}. Riding the bestseller is how a slow dish gets tasted.`,
      watchOut: `If it still doesn't move after a month of this, the dish isn't the problem — the menu photo or the name is. Or it's time to rest it.`,
    });
  }

  if (repeatPct < 30 && s.customers.total >= 5) {
    promos.push({
      name: "Second-order card",
      mechanic: "A small printed card in every delivery bag: a fixed peso amount off their next order, valid two weeks.",
      why: `Only ${repeatPct}% of your customers order twice. The cheapest sale you'll ever make is the second one to someone who already liked the food.`,
      watchOut: "Give a peso amount, not a percentage — it's easier to honour at the stall, and easier for the customer to understand.",
    });
  }

  if (s.freeDeliveryOver > 0 && s.revenue.avgOrder > 0 && s.revenue.avgOrder < s.freeDeliveryOver * 0.8) {
    promos.push({
      name: "Move the free-delivery line",
      mechanic: `Bring it from ${peso(s.freeDeliveryOver)} down to around ${peso(Math.ceil((s.revenue.avgOrder * 1.25) / 50) * 50)} — just above what people typically spend, so it's reachable with one more item.`,
      why: `Your average order is ${peso(s.revenue.avgOrder)}. A threshold people can't reach doesn't change anyone's behaviour; one just above their usual spend does.`,
      watchOut: "Check the new line still covers the rider on your longer runs before you announce it.",
    });
  }

  // ------------------------------------------------------------------- menu
  const dead = s.slowMovers.filter((m) => m.qty === 0);
  if (dead.length > 0) {
    menu.push(
      `${dead.map((m) => m.name).join(", ")} sold nothing in 30 days. Usually it's the photo or the description, not the food — try one good photo before you drop it.`
    );
  }

  if (top) {
    menu.push(
      `${top.name} is ${Math.round((top.revenue / Math.max(s.revenue.last30, 1)) * 100)}% of your sales at ${top.qty} sold. Never let it go out of stock — mark it unavailable the moment it does, or you'll take orders you can't fill.`
    );
  }

  if (s.bestSellers.length >= 3) {
    const tail = s.bestSellers.slice(2).reduce((sum, m) => sum + m.qty, 0);
    const head = s.bestSellers.slice(0, 2).reduce((sum, m) => sum + m.qty, 0);
    if (head > tail) {
      menu.push(
        `Your top two dishes outsell everything else combined (${head} against ${tail}). A shorter menu you cook better usually beats a long one — worth considering when something needs resting.`
      );
    }
  }

  if (s.questionsAsked.length >= 3) {
    menu.push(
      `${s.questionsAsked.length} different questions came through the chat. Anything asked repeatedly belongs on the Menu page as text — a question answered before it's asked is an order you don't lose.`
    );
  }

  return {
    advice: { headline, readings, ads, social, promos, menu },
    error: null,
  };
}
