import { can, getViewer } from "@/lib/auth";
import { getAllAnnouncements } from "@/lib/announcements-server";
import { AnnouncementEditor } from "@/components/announcement-editor";
import { MarketingCalculator } from "@/components/marketing-calculator";
import { listCampaigns } from "@/app/admin/promos/marketing-actions";
import { loadShopNormal } from "@/lib/marketing-server";
import { hqTitle } from "@/lib/hq-theme";
import { createAdminClient } from "@/lib/supabase/admin";
import { PromoCodes, type PromoRow } from "@/components/promo-codes";

// What is live depends on the clock — a promo scheduled for tomorrow has to
// read as "Scheduled" today and "On the homepage" tomorrow, without a deploy.
export const dynamic = "force-dynamic";

export default async function AdminPromosPage() {
  const viewer = await getViewer();
  if (!can(viewer, "announcements")) {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className={hqTitle}>Owner and manager only</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          This is what the shop says in public on its own homepage, so it is
          kept to the people who answer for it.
        </p>
      </div>
    );
  }

  // Read alongside the announcements rather than after them: three
  // independent queries that the page cannot render without, so waiting for
  // them one at a time costs three round trips for no reason.
  const [{ rows, error }, campaigns, normal] = await Promise.all([
    getAllAnnouncements(),
    listCampaigns(),
    loadShopNormal(),
  ]);

  /**
   * The discounts, with what each has actually cost.
   *
   * Counted here rather than kept on the promo row, so cancelling an order
   * frees the use back up on its own — `promo_redemptions` cascades with
   * the order it belongs to. A counter column would have to be decremented
   * by hand, and the day somebody forgets is the day a code reads as used
   * up by orders that no longer exist.
   *
   * Only the owner sees this block: discounts are money going out, which is
   * the same gate the takings are behind.
   */
  const canDiscount = can(viewer, "business");
  const db = createAdminClient();
  const [{ data: promoRows }, { data: usesRows }, { data: dishRows }] = canDiscount
    ? await Promise.all([
        db
          .from("promos")
          .select(
            "id, code, label, description, kind, value, scope, meal_id, min_spend, max_discount, max_uses, max_per_customer, starts_on, ends_on, online, at_counter, is_active"
          )
          .order("is_active", { ascending: false })
          .order("created_at", { ascending: false }),
        db.from("promo_redemptions").select("promo_id, amount"),
        db
          .from("meals")
          .select("id, name")
          .order("name"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const usage = new Map<string, { used: number; given: number }>();
  for (const r of (usesRows ?? []) as { promo_id: string; amount: number }[]) {
    const at = usage.get(r.promo_id) ?? { used: 0, given: 0 };
    at.used += 1;
    at.given += Number(r.amount) || 0;
    usage.set(r.promo_id, at);
  }
  const promos: PromoRow[] = (
    (promoRows ?? []) as Omit<PromoRow, "used" | "given">[]
  ).map((p) => ({
    ...p,
    used: usage.get(p.id)?.used ?? 0,
    given: usage.get(p.id)?.given ?? 0,
  }));

  if (error) {
    return (
      <div className="rounded-3xl bg-gold-50 p-8 ring-1 ring-gold-400/40">
        <h2 className={hqTitle}>Promos &amp; news</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          Run <strong>migration 0025</strong> in the Supabase SQL Editor to
          switch this on. It is what lets you change the scrolling strip on the
          homepage without a code change.
        </p>
        <p className="mt-3 rounded-xl bg-cream-50 px-4 py-2 font-mono text-xs text-ink-800/70">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Above the editor on purpose. Deciding WHETHER a promo is worth
          running comes before writing the words for it, and the shop has
          never had anywhere to answer the first question. */}
      <MarketingCalculator
        rows={campaigns.rows}
        normal={normal}
        error={campaigns.error}
      />

      <div>
        <h2 className={hqTitle}>Promos &amp; news</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          This is the homepage talking. A <strong>promo</strong> scrolls across
          the top and shows as a card; <strong>news</strong> is the dated stuff
          — a closure, a new dish, a change of hours. Give either one an end
          date and it takes itself down, so a promo that finished on Sunday
          isn&apos;t still being honoured on Wednesday.
        </p>
      </div>

      <AnnouncementEditor rows={rows} />

      {/* Under the homepage editor, because it is a different job: that one
          is what the shop SAYS, this is what the shop gives away. Owner only
          — a discount is money going out, and it sits behind the same gate
          the takings do. */}
      {canDiscount && (
        <PromoCodes
          rows={promos}
          dishes={(dishRows ?? []) as { id: string; name: string }[]}
        />
      )}
    </div>
  );
}
