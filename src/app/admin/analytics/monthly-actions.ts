"use server";

import { can, getViewer } from "@/lib/auth";
import { monthlyReport } from "@/lib/monthly-report-server";
import type { Report } from "@/lib/monthly-report";

/**
 * One month's report, fetched when somebody opens that row.
 *
 * Twelve months of reports is twelve months of queries, and Analytics is
 * already a heavy page — so the months are listed at render and the work
 * happens on the tap.
 *
 * Gated on `business` like the page itself: this is the takings, the
 * margin and what the shop pays out, which is the owner's screen.
 */
export async function loadMonthlyReport(month: string): Promise<Report | null> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) return null;
  // The month comes off a list this server produced, but it arrives through
  // the browser — so it is checked rather than trusted into a query.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  return monthlyReport(month);
}
