"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordOrderCost } from "@/lib/costing-server";
import { syncStockForStatus } from "@/lib/stock-server";
import { openShiftFor } from "@/lib/shifts-server";
import { NOT_ON_SHIFT, offShift } from "@/lib/shift-guard";
import { orderLabel } from "@/lib/tickets";
import { cartQuantityProblem } from "@/lib/orders";
import { loadStockPicture } from "@/lib/costing-server";
import { METHOD_FOR_TILL, type TillMethod } from "@/lib/till";
import { loadModifiers } from "@/lib/modifiers-server";
import { groupsFor, resolveChoice, type ChosenExtra } from "@/lib/modifiers";
import { poolShortfalls, type TicketLine } from "@/lib/costing";

/**
 * One line rung up.
 *
 * `options` is what was ticked and how many of each — no labels, no prices.
 * The till runs in a browser like any other page, so every peso on the sale
 * is re-read here from the menu. See `resolveChoice`.
 */
export type CounterLine = {
  mealId: string;
  qty: number;
  options?: { id: string; qty: number }[];
};

export type CounterResult =
  | { error: string; orderId?: undefined; total?: undefined; ticket?: undefined }
  | { error: null; orderId: string; total: number; ticket: number };

/**
 * A sale that happened at the stall.
 *
 * Until now the shop could only see the slice of itself that came through the
 * website. Every figure in HQ — the day's takings, the best sellers, the
 * busiest weekday, and now the margins — described online orders only, while
 * most of a street stall's money walks up and pays in cash. The numbers
 * weren't wrong so much as answering a smaller question than anyone reading
 * them thought.
 *
 * The row is an ordinary order with no `customer_id`, which is exactly what
 * the schema's comment said a walk-in was on day one. That means it flows
 * through the analytics, the exports and the costing without any of them
 * needing to know where it came from.
 */
type SaleInput = {
  lines: CounterLine[];
  method: TillMethod;
  reference?: string;
  /** Straight into the day's takings, or onto the kitchen board first. */
  toKitchen: boolean;
  /** Eating at the stall — the one case where nothing is packed. */
  dineIn?: boolean;
  note?: string;
  /** Who the order is for. Goes in `contact_name`, the column that has always
   *  been there for it, so the name shows on the order as well as the paper. */
  customerName?: string;
};

/**
 * Nothing unexpected takes the till down mid-service.
 *
 * An uncaught throw in a server action does not surface as a message on the
 * screen that called it — React hands it to the nearest error boundary, so HQ
 * replaced the whole counter with "This screen didn't load" and the ticket the
 * cashier had just typed went with it. That happened, from a plain
 * use-before-declaration, with a customer standing at the stall.
 *
 * Every refusal this function means to make already comes back as
 * `{ error }` and leaves the ticket alone. This makes that true of the ones
 * it does not mean to make as well: the cashier reads a line, the order is
 * still on screen, and the real reason is in the log under the reference.
 */
export async function recordWalkInSale(input: SaleInput): Promise<CounterResult> {
  try {
    return await ringUp(input);
  } catch (e) {
    console.error(
      `[counter] ring-up threw: ${e instanceof Error ? e.stack ?? e.message : String(e)}`
    );
    return {
      error:
        "Something went wrong recording that sale, so nothing was saved — the ticket is still here. Try once more, and tell the owner if it happens again.",
    };
  }
}

async function ringUp(input: SaleInput): Promise<CounterResult> {
  const viewer = await getViewer();
  if (!can(viewer, "till")) return { error: "Only shop staff can record a sale." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

  // The stepper can legitimately take a line to zero, which means "removed" —
  // so those are dropped rather than refused. What is left still has to be a
  // real count: the till writes straight into the day's takings.
  const lines = input.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) return { error: "Add something to the order first." };
  const badQuantity = cartQuantityProblem(lines);
  if (badQuantity) return { error: badQuantity };

  // Prices come from the database, never from the browser. The counter screen
  // shows a total, but the total that gets recorded is the one the server
  // works out — otherwise the takings are whatever a tampered request says
  // they are.
  const supabase = createAdminClient();
  const { data: meals, error: mealsError } = await supabase
    .from("meals")
    .select("id, name, price, product_id")
    .in("id", lines.map((l) => l.mealId));
  if (mealsError) return { error: mealsError.message };

  const priceById = new Map(
    ((meals ?? []) as { id: string; price: number }[]).map((m) => [
      m.id,
      Number(m.price) || 0,
    ])
  );
  const missing = lines.filter((l) => !priceById.has(l.mealId));
  if (missing.length > 0) {
    return {
      error: "Something on this order is no longer on the menu. Clear it and start again.",
    };
  }

  // --- Add-ons ------------------------------------------------------------
  const nameById = new Map(
    ((meals ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name])
  );
  const productById = new Map(
    ((meals ?? []) as { id: string; product_id: string | null }[]).map((m) => [
      m.id,
      m.product_id,
    ])
  );
  const wantsAddOns = lines.some((l) => (l.options ?? []).length > 0);
  const addOns = wantsAddOns
    ? await loadModifiers(supabase)
    : { byMeal: new Map(), byProduct: new Map(), all: [], error: null };
  if (wantsAddOns && addOns.error) {
    return { error: "Couldn't read the add-ons. Try again in a moment." };
  }

  const extrasPerLine: ChosenExtra[][] = [];
  for (const l of lines) {
    const picks = l.options ?? [];
    if (picks.length === 0) {
      extrasPerLine.push([]);
      continue;
    }
    const { extras, problem } = resolveChoice(
      groupsFor(
        l.mealId,
        productById.get(l.mealId) ?? null,
        addOns.byMeal,
        addOns.byProduct
      ),
      picks,
      nameById.get(l.mealId) ?? "that dish"
    );
    if (problem) return { error: problem };
    extrasPerLine.push(extras);
  }
  const extraTotal = (at: number) =>
    extrasPerLine[at].reduce((n, e) => n + e.price * e.qty, 0);

  const subtotal = lines.reduce(
    (sum, l, at) => sum + (priceById.get(l.mealId)! + extraTotal(at)) * l.qty,
    0
  );

  /**
   * Stock, AFTER the add-ons and not before them.
   *
   * This block used to sit above the one that declares `nameById` and
   * `extrasPerLine` — and because the use was inside a `forEach` callback,
   * neither TypeScript nor the build could see it: a closure MIGHT run later,
   * so use-before-declaration inside one is not an error the compiler will
   * call. It runs immediately here, so every single counter sale threw
   * `Cannot access 'nameById' before initialization` out of the server action
   * and straight into HQ's error screen. Not some sales — all of them, with
   * or without add-ons.
   *
   * The order is not cosmetic either way: what the shelf has to cover is the
   * dishes PLUS everything added to them, so the extras have to be resolved
   * before there is anything to count.
   */
  // Same check as the website. The till is the one place someone can insist —
  // the customer is standing there — so it says what is short and by how
  // much rather than just refusing.
  const { limits } = await loadStockPicture();

  // Dishes AND add-ons, added up PER INGREDIENT and checked against the shelf
  // once — not dish by dish.
  //
  // Dish by dish was the bug. Every dish's "N left" is worked out on its own
  // against the whole shelf, which is right: two Giant Ji Pai variants sharing
  // a tub of breading should each offer everything that tub can make. But the
  // numbers overlap, and a check that reads them one dish at a time believes
  // the overlap. Breading enough for two Giants, and two Originals plus two
  // Spicies all pass their own test while the ticket takes four Giants' worth
  // out of a tub holding two. Nothing refused it and the shelf went negative,
  // because `apply_order_stock` subtracts without arguing.
  // Named `drawing` rather than `ticket`: that word already means the number
  // printed on the receipt, further down this same function.
  const drawing: TicketLine[] = [];
  lines.forEach((l, at) => {
    drawing.push({ mealId: l.mealId, qty: l.qty });
    for (const e of extrasPerLine[at]) {
      // An add-on IS a dish and draws the same stock. Two extra rice on a line
      // of three is six portions.
      if (e.mealId) drawing.push({ mealId: e.mealId, qty: l.qty * e.qty });
    }
  });

  const short = poolShortfalls(drawing, limits);
  if (short.length > 0) {
    // Naming the INGREDIENT, not the dish, which is the whole point.
    // "Not enough stock for Cheesy Giant Jipai (2 left, 6 rung up)" sent the
    // owner looking at a shelf of thirteen marinated chickens wondering what
    // the system was talking about. The chickens were never the problem.
    const round = (n: number) =>
      Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 0);
    const detail = short
      .slice(0, 3)
      .map(
        (s) =>
          `${s.label} (${round(s.have)} ${s.unit} left, this ticket needs ${round(s.need)})`
      )
      .join("; ");
    return {
      error:
        `Short on ${detail}. That is what runs out first — the dishes on the ticket share it. ` +
        `Make or buy more, fix the count in Inventory, or take something off the ticket.`,
    };
  }

  const reference = input.reference?.trim() || null;
  if (input.method === "gcash" && !reference) {
    return { error: "Add the GCash reference number." };
  }

  // Which shift rang it up. Never null for staff now: the gate above turned
  // that away, because a sale with no shift on it is a sale the owner can see
  // happened and cannot trace. The owner is the one exception — they are not
  // on a rota — and their sales carry their name through `logged_by` instead.
  const staffId = viewer!.profile?.id ?? null;
  const shift = staffId ? await openShiftFor(staffId) : null;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: null,
      shift_id: shift?.id ?? null,
      // Who was on the counter. The column has existed since the first
      // migration and nothing has ever written to it.
      logged_by: viewer!.profile?.full_name?.trim() || viewer!.email,
      // Walk-ins are handed over and paid for at the counter, so the default
      // is a finished sale. Sending it to the kitchen is the busy-service
      // case, and then it's the board that says when it's done.
      status: input.toKitchen ? "confirmed" : "completed",
      // Dine-in is a real third thing, not a label: it's the case where
      // no container, no sauce cup and no bag leave the shelf, so the stock
      // engine and the costing both charge this order for food only.
      fulfillment: input.dineIn ? "dine_in" : "pickup",
      // "cod" is this system's word for cash — METHOD_LABEL already renders it
      // as "Cash", and the payments ledger looks the method up in that map with
      // no fallback. Storing the till's own word here would leave every
      // walk-in showing a blank payment method on the screen that exists to
      // reconcile them.
      payment_method: METHOD_FOR_TILL[input.method],
      // Money already in the drawer. Unlike an online GCash order — which
      // only *claims* to be paid until staff match the reference — the person
      // paying is standing right there.
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      payment_plan: "full",
      payment_reference: reference,
      revenue: subtotal,
      contact_name: input.customerName?.trim() || null,
      notes: input.note?.trim() || null,
      tag: "walk-in",
    })
    .select("id, ticket")
    .single();
  if (orderError || !order) {
    return { error: orderError?.message ?? "Could not record the sale." };
  }
  const ticket = Number((order as { ticket: number }).ticket);

  // The dish's own price on the line, its add-ons on their own rows — so the
  // best-seller report still knows what a rice meal costs, and the receipt
  // adds up in front of the customer.
  const { data: insertedLines, error: linesError } = await supabase
    .from("order_lines")
    .insert(
      lines.map((l) => ({
        order_id: order.id,
        meal_id: l.mealId,
        qty: l.qty,
        price_at_sale: priceById.get(l.mealId)!,
      }))
    )
    .select("id");
  if (linesError) {
    // The order exists but has nothing in it, which would show up as a ₱X sale
    // of nothing and quietly skew the best-sellers. Removed rather than left.
    await supabase.from("orders").delete().eq("id", order.id);
    return { error: linesError.message };
  }

  const lineIds = (insertedLines ?? []).map((r) => r.id as number);
  const extraRows =
    lineIds.length === lines.length
      ? lines.flatMap((_, at) =>
          extrasPerLine[at].map((e) => ({
            order_line_id: lineIds[at],
            option_id: e.optionId,
            meal_id: e.mealId,
            label: e.label,
            price_at_sale: e.price,
            qty: e.qty,
          }))
        )
      : [];
  if (extraRows.length > 0) {
    const { error: extrasError } = await supabase
      .from("order_line_extras")
      .insert(extraRows);
    if (extrasError) {
      // The customer has already been charged for a drink the kitchen would
      // never be told to pour. Taken back out rather than half-recorded — and
      // `revenue` included those add-ons, so leaving it would overstate the
      // day's takings as well as the order.
      await supabase.from("orders").delete().eq("id", order.id);
      return { error: extrasError.message };
    }
  }

  // The estimate first, from current recipe prices, so an order always has a
  // cost even if stock movement can't run. Then the real thing: the movement
  // engine overwrites `cogs` with what actually came off the shelf, lot
  // prices and all. Same column, refined — not two sources of truth.
  await recordOrderCost(order.id);
  await syncStockForStatus(order.id, input.toKitchen ? "confirmed" : "completed");

  /**
   * On the record, and this is the line that was missing.
   *
   * A counter sale sent to the kitchen board picked up an activity line later,
   * when somebody moved it along — so it showed in the shift report. A sale
   * rung up and handed straight over never touched `activity_log` at all, so
   * the shift's takings included it and the shift's list of what happened did
   * not. Same sale, two different answers, depending on one checkbox.
   *
   * The label leads with the ticket, so the owner can paste it into the search
   * box on Orders and land on this exact sale.
   */
  const label = orderLabel(ticket, input.customerName);
  const { error: logError } = await supabase.from("activity_log").insert({
    category: "orders",
    description:
      `Rang up ${label} at the counter — ₱${subtotal.toFixed(2)} ` +
      `${input.method === "cash" ? "cash" : "GCash"}` +
      `${input.toKitchen ? ", sent to the kitchen" : ", handed over"}`,
    actor: staffId,
  });
  if (logError) console.error(`[counter] log: ${logError.message}`);

  // The board, the day's takings and the sidebar counts all move.
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/counter");

  return { error: null, orderId: order.id, total: subtotal, ticket };
}
