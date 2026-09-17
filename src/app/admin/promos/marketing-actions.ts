"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CAMPAIGN_KINDS, type CampaignKind } from "@/lib/marketing";

/**
 * Saving a campaign, and nothing else.
 *
 * Worth saying once, here, where anybody adding to this file will read it:
 * **nothing in this file may ever touch money.** No `cash_ledger` insert, no
 * order, no balance. The owner asked for a calculator that does not move the
 * shop's money, and the value of the Pepper Pan Bank figures rests entirely
 * on their being countable against a real drawer. A "helpful" line here that
 * also books the ad spend would double-count it the moment the owner records
 * the same spend as a Money out — which is where it belongs.
 *
 * The ad money leaving the shop is a Money out line in the drawer. This is
 * the working-out about whether it was worth it.
 */

type Result = { error: string | null };

export type CampaignRow = {
  id: string;
  name: string;
  kind: CampaignKind;
  started_on: string;
  days: number;
  spend: number;
  giveaway_cost: number;
  discount_given: number;
  baseline_per_day: number;
  during_per_day: number | null;
  margin_ratio: number;
  new_customers: number;
  returned: number;
  note: string | null;
};

const COLUMNS =
  "id, name, kind, started_on, days, spend, giveaway_cost, discount_given, baseline_per_day, during_per_day, margin_ratio, new_customers, returned, note";

async function mayRecord() {
  const viewer = await getViewer();
  // The same gate as the Promos page this sits on: the shop's advertising
  // budget and its results are the owner's and the manager's business.
  return can(viewer, "announcements") ? viewer : null;
}

/** A number from a form box, which is a string and may be nonsense. */
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export async function listCampaigns(): Promise<{
  rows: CampaignRow[];
  error: string | null;
}> {
  if (!(await mayRecord())) return { rows: [], error: null };

  const { data, error } = await createAdminClient()
    .from("marketing_campaigns")
    .select(COLUMNS)
    .order("started_on", { ascending: false })
    .limit(100);

  // A missing table is migration 0044 not having been run, which the page
  // says in words rather than showing as a crash.
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as CampaignRow[], error: null };
}

export async function saveCampaign(input: {
  /** Absent when creating. */
  id?: string;
  name: string;
  kind: CampaignKind;
  startedOn: string;
  days: number;
  spend: number;
  giveawayCost: number;
  discountGiven: number;
  baselinePerDay: number;
  /** Empty string means it hasn't run yet — stored as null, not as zero. */
  duringPerDay: string;
  marginRatio: number;
  newCustomers: number;
  returned: number;
  note: string;
}): Promise<Result> {
  const viewer = await mayRecord();
  if (!viewer) {
    return { error: "Only the owner or a manager can keep these records." };
  }

  const name = input.name.trim();
  if (!name) {
    return { error: "Give it a name you'll recognise later — “Boost ng reel”, “Fiesta free taste”." };
  }
  if (!CAMPAIGN_KINDS.includes(input.kind)) {
    return { error: "Pick what kind of marketing this was." };
  }

  const days = Math.max(1, Math.round(num(input.days)) || 1);
  const newCustomers = Math.round(num(input.newCustomers));
  // The database refuses this too, but a form that reports a check violation
  // is telling the owner about a constraint instead of about their shop.
  const returned = Math.min(newCustomers, Math.round(num(input.returned)));

  // "Hasn't run yet" has to survive the round trip as a distinct thing from
  // "ran and took nothing", or every plan reads as a total failure.
  const during = input.duringPerDay.trim() === "" ? null : num(input.duringPerDay);

  const row = {
    name,
    kind: input.kind,
    started_on: input.startedOn || new Date().toISOString().slice(0, 10),
    days,
    spend: num(input.spend),
    giveaway_cost: num(input.giveawayCost),
    discount_given: num(input.discountGiven),
    baseline_per_day: num(input.baselinePerDay),
    during_per_day: during,
    margin_ratio: Math.min(1, Math.max(0, num(input.marginRatio))),
    new_customers: newCustomers,
    returned,
    note: input.note.trim() || null,
  };

  const supabase = createAdminClient();
  const { error } = input.id
    ? await supabase.from("marketing_campaigns").update(row).eq("id", input.id)
    : await supabase
        .from("marketing_campaigns")
        .insert({ ...row, created_by: viewer.profile?.id ?? null });

  if (error) return { error: error.message };

  revalidatePath("/admin/promos");
  return { error: null };
}

export async function deleteCampaign(id: string): Promise<Result> {
  if (!(await mayRecord())) {
    return { error: "Only the owner or a manager can remove these." };
  }
  const { error } = await createAdminClient()
    .from("marketing_campaigns")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/promos");
  return { error: null };
}
