"use server";

import { can, getViewer } from "@/lib/auth";
import { analyseShop, type Advice } from "@/lib/marketing-analyst";
import { buildSnapshot } from "./snapshot";

/**
 * Run the marketing analysis on demand.
 *
 * Run on a button rather than on page load: it reads several months of orders
 * to build the snapshot, and the numbers don't move fast enough to justify
 * that work on every refresh.
 */
export async function runAnalysis(): Promise<{
  advice: Advice | null;
  error: string | null;
}> {
  // The /admin layout gates the page, but a Server Action is its own endpoint
  // — anyone who learns its id can call it. So the check is repeated here.
  const viewer = await getViewer();
  if (!can(viewer, "business")) {
    return { advice: null, error: "Only the shop's own account can run this." };
  }

  const snapshot = await buildSnapshot();

  if (snapshot.orders.last30 === 0 && snapshot.orders.prior30 === 0) {
    return {
      advice: null,
      error:
        "There aren't any orders yet to analyse. Come back once you've taken a few — even a week's worth is enough.",
    };
  }

  return analyseShop(snapshot);
}
