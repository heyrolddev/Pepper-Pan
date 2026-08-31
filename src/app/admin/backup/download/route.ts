import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectSnapshot, snapshotToJson, toCsv } from "@/lib/backup";
import {
  costBatches,
  costMeals,
  marginFor,
  stockValue,
  type Batch,
  type BatchIngredient,
  type Ingredient,
  type Meal,
  type MealComponent,
  type MealIngredient,
} from "@/lib/costing";

/**
 * The file itself.
 *
 * A route handler rather than a server action, for one reason that matters: a
 * server action would have to hand the whole backup back through React as a
 * string and have the browser build a blob from it, and a megabyte of JSON
 * does not belong in a React payload. This streams as a real file with a real
 * filename and a real Content-Disposition, which is also what makes the
 * browser save it instead of showing it.
 *
 * SECURITY: layouts do not run for route handlers. `/admin/layout.tsx` gates
 * every *page* under /admin, and none of that applies here — this file has to
 * do its own check, and it is the check standing between a URL and the shop's
 * entire customer list.
 */

// Nothing here may ever be cached: a cached backup is last week's backup
// wearing today's filename.
export const dynamic = "force-dynamic";

/** Manila, so a file saved at 11pm carries tonight's date and not tomorrow's. */
function stamp(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}_${get("hour")}${get("minute")}`;
}

function file(body: string, name: string, type: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Rows for the costing helpers, in one round trip. */
async function loadRecipeTables() {
  const supabase = createAdminClient();
  const [ing, bat, batIng, mea, meaIng, meaComp] = await Promise.all([
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("batches").select("*").order("name"),
    supabase.from("batch_ingredients").select("*"),
    supabase.from("meals").select("*").order("name"),
    supabase.from("meal_ingredients").select("*"),
    supabase.from("meal_components").select("*"),
  ]);
  return {
    ingredients: (ing.data ?? []) as Ingredient[],
    batches: (bat.data ?? []) as Batch[],
    batchIngredients: (batIng.data ?? []) as BatchIngredient[],
    meals: (mea.data ?? []) as Meal[],
    mealIngredients: (meaIng.data ?? []) as MealIngredient[],
    mealComponents: (meaComp.data ?? []) as MealComponent[],
  };
}

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  // Owner only, not staff. The full export is every customer's name, phone and
  // address in one file — that is the owner's to carry, not a shift's.
  if (viewer?.profile?.role !== "owner") {
    return new NextResponse("Not found", { status: 404 });
  }

  const kind = request.nextUrl.searchParams.get("file") ?? "full.json";
  const at = stamp();
  const supabase = createAdminClient();

  if (kind === "full.json") {
    const snapshot = await collectSnapshot();
    // Stamped here rather than when the button is clicked, because this is the
    // moment a file actually exists. A "last backed up" date that records
    // intent rather than a file is the kind of reassurance that gets someone
    // through a data loss believing they were covered.
    await supabase
      .from("settings")
      .update({ last_backup_date: new Date().toISOString() })
      .eq("id", 1);
    return file(
      snapshotToJson(snapshot),
      `pepperpan-backup_${at}.json`,
      "application/json"
    );
  }

  if (kind === "orders.csv") {
    const { data } = await supabase
      .from("orders")
      .select(
        "id, date, created_at, status, fulfillment, payment_method, payment_status, contact_name, contact_phone, revenue, notes, scheduled_for"
      )
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Record<string, unknown>[];
    return file(
      toCsv(
        [
          "Order ID",
          "Date",
          "Placed at",
          "Status",
          "Pickup or delivery",
          "Payment method",
          "Payment status",
          "Customer",
          "Phone",
          "Total",
          "Scheduled for",
          "Notes",
        ],
        rows.map((o) => [
          o.id,
          o.date,
          o.created_at,
          o.status,
          o.fulfillment,
          o.payment_method,
          o.payment_status,
          o.contact_name,
          o.contact_phone,
          o.revenue,
          o.scheduled_for,
          o.notes,
        ])
      ),
      `pepperpan-orders_${at}.csv`,
      "text/csv"
    );
  }

  if (kind === "order-lines.csv") {
    const [{ data: lines }, { data: orders }, { data: meals }] = await Promise.all([
      supabase.from("order_lines").select("*"),
      supabase.from("orders").select("id, date, status"),
      supabase.from("meals").select("id, name"),
    ]);
    const orderById = new Map(
      ((orders ?? []) as { id: string; date: string; status: string }[]).map((o) => [o.id, o])
    );
    const mealById = new Map(
      ((meals ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name])
    );
    const rows = ((lines ?? []) as Record<string, unknown>[])
      .map((l) => {
        const o = orderById.get(String(l.order_id));
        const qty = Number(l.qty) || 0;
        const price = Number(l.price_at_sale) || 0;
        return [
          o?.date ?? "",
          l.order_id,
          o?.status ?? "",
          mealById.get(String(l.meal_id)) ?? "(deleted dish)",
          qty,
          price,
          qty * price,
        ];
      })
      // Newest first, matching how the orders file reads.
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    return file(
      toCsv(
        ["Date", "Order ID", "Status", "Dish", "Qty", "Price each", "Line total"],
        rows
      ),
      `pepperpan-order-lines_${at}.csv`,
      "text/csv"
    );
  }

  if (kind === "customers.csv") {
    const [{ data: profiles }, { data: orders }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, address, role, is_verified, is_blocked, created_at")
        .eq("role", "customer")
        .order("created_at", { ascending: false }),
      supabase.from("orders").select("customer_id, status, revenue").not("customer_id", "is", null),
    ]);
    const stats = new Map<string, { orders: number; spent: number; last: string }>();
    for (const o of (orders ?? []) as {
      customer_id: string;
      status: string;
      revenue: number;
    }[]) {
      const cur = stats.get(o.customer_id) ?? { orders: 0, spent: 0, last: "" };
      cur.orders += 1;
      if (o.status === "completed") cur.spent += Number(o.revenue) || 0;
      stats.set(o.customer_id, cur);
    }
    return file(
      toCsv(
        ["Name", "Phone", "Address", "Verified", "Blocked", "Joined", "Orders", "Total spent"],
        ((profiles ?? []) as Record<string, unknown>[]).map((p) => {
          const s = stats.get(String(p.id)) ?? { orders: 0, spent: 0 };
          return [
            p.full_name,
            p.phone,
            p.address,
            p.is_verified ? "yes" : "no",
            p.is_blocked ? "yes" : "no",
            p.created_at,
            s.orders,
            s.spent,
          ];
        })
      ),
      `pepperpan-customers_${at}.csv`,
      "text/csv"
    );
  }

  if (kind === "dish-costs.csv") {
    const t = await loadRecipeTables();
    const batchCosts = costBatches(t.batches, t.batchIngredients, t.ingredients);
    const mealCosts = costMeals(
      t.meals,
      t.mealIngredients,
      t.mealComponents,
      t.ingredients,
      batchCosts
    );
    return file(
      toCsv(
        [
          "Dish",
          "On the menu",
          "Available",
          "Price",
          "Ingredient cost",
          "Gross profit",
          "Food cost %",
          "Margin %",
          "Verdict",
          "Problems",
        ],
        [...mealCosts.values()].map((mc) => {
          const m = marginFor(mc.meal.price, mc.cost, mc.costed);
          return [
            mc.meal.name,
            mc.meal.is_public ? "yes" : "no",
            mc.meal.is_available ? "yes" : "no",
            mc.meal.price,
            mc.costed ? mc.cost.toFixed(2) : "",
            mc.costed ? m.gross.toFixed(2) : "",
            m.foodCostPct === null ? "" : m.foodCostPct.toFixed(1),
            m.marginPct === null ? "" : m.marginPct.toFixed(1),
            mc.costed ? m.verdict : "no recipe entered",
            mc.problems.join("; "),
          ];
        })
      ),
      `pepperpan-dish-costs_${at}.csv`,
      "text/csv"
    );
  }

  if (kind === "inventory.csv") {
    const { data } = await supabase.from("ingredients").select("*").order("name");
    const rows = (data ?? []) as Ingredient[];
    return file(
      toCsv(
        [
          "Ingredient",
          "Unit",
          "Bought for",
          "Bought qty",
          "Cost per unit",
          "Stock on hand",
          "Reorder at",
          "Stock value",
          "Low",
          "Categories",
        ],
        rows.map((i) => [
          i.name,
          i.unit,
          i.purchase_price,
          i.purchase_qty,
          Number(i.cost).toFixed(4),
          i.stock,
          i.reorder,
          stockValue(i).toFixed(2),
          Number(i.reorder) > 0 && Number(i.stock) <= Number(i.reorder) ? "yes" : "",
          (i.categories ?? []).join(" / "),
        ])
      ),
      `pepperpan-inventory_${at}.csv`,
      "text/csv"
    );
  }

  if (kind === "recipes.csv") {
    const t = await loadRecipeTables();
    const batchCosts = costBatches(t.batches, t.batchIngredients, t.ingredients);
    const mealCosts = costMeals(
      t.meals,
      t.mealIngredients,
      t.mealComponents,
      t.ingredients,
      batchCosts
    );
    // One row per line, both for batches and dishes — the flat shape a
    // spreadsheet can pivot, and the only file here that carries the actual
    // recipes rather than a summary of them.
    const rows: unknown[][] = [];
    for (const b of batchCosts.values()) {
      for (const l of b.lines) {
        rows.push([
          "Batch",
          b.batch.name,
          l.label,
          l.kind,
          l.qty,
          l.unit,
          l.unitCost.toFixed(4),
          l.cost.toFixed(2),
          l.problem ?? "",
        ]);
      }
    }
    for (const m of mealCosts.values()) {
      for (const l of m.lines) {
        rows.push([
          "Dish",
          m.meal.name,
          l.label,
          l.kind,
          l.qty,
          l.unit,
          l.unitCost.toFixed(4),
          l.cost.toFixed(2),
          l.problem ?? "",
        ]);
      }
    }
    return file(
      toCsv(
        ["Makes", "Name", "Uses", "Type", "Qty", "Unit", "Cost per unit", "Line cost", "Problem"],
        rows
      ),
      `pepperpan-recipes_${at}.csv`,
      "text/csv"
    );
  }

  return new NextResponse("Unknown file", { status: 400 });
}
