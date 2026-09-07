import { createClient } from "@/lib/supabase/server";
import { AdminReviewList, type AdminReview } from "@/components/admin-review-list";
import { RelayedReviewForm, type MealChoice } from "@/components/relayed-review-form";
import { Stars } from "@/components/stars";
import { displayName } from "@/lib/reviews";
import { can, getViewer } from "@/lib/auth";
import { hqTitle } from "@/lib/hq-theme";

type Row = {
  id: string;
  customer_id: string | null;
  author_name: string | null;
  source: string;
  relayed_by: string | null;
  meal_id: string | null;
  rating: number;
  comment: string | null;
  shop_reply: string | null;
  is_hidden: boolean;
  created_at: string;
};

export default async function AdminReviewsPage() {
  const supabase = await createClient();
  const canRelay = can(await getViewer(), "reviews.relay");

  // Staff RLS returns hidden reviews too, which is the point of this page.
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, customer_id, author_name, source, relayed_by, meal_id, rating, comment, shop_reply, is_hidden, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return (
      <div className="rounded-3xl bg-brand-50 p-8 ring-2 ring-brand-600/40">
        <h2 className="font-display text-2xl font-black text-brand-700">
          Couldn&apos;t load reviews
        </h2>
        <p className="mt-3 rounded-xl bg-cream-50 px-4 py-3 font-mono text-xs text-ink-800/70">
          {error.message}
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as Row[];

  // Both the authors and whoever typed a relayed one in, looked up together.
  const accountIds = [
    ...new Set(
      rows.flatMap((r) => [r.customer_id, r.relayed_by].filter(Boolean) as string[])
    ),
  ];

  // The dish list for the relay form, not just the dishes already reviewed —
  // so the owner can attach a Messenger review to anything on the menu.
  const [profilesRes, mealsRes] = await Promise.all([
    accountIds.length
      ? supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", accountIds)
      : Promise.resolve({
          data: [] as { id: string; full_name: string | null; avatar_url: string | null }[],
        }),
    supabase.from("meals").select("id, name").order("name"),
  ]);

  const accounts = new Map(
    (
      (profilesRes.data ?? []) as {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
      }[]
    ).map((p) => [p.id, p])
  );
  const mealList = ((mealsRes.data ?? []) as MealChoice[]).map((m) => ({
    id: m.id,
    name: m.name,
  }));
  const meals = new Map(mealList.map((m) => [m.id, m.name]));

  const reviews: AdminReview[] = rows.map((r) => {
    const account = r.customer_id ? accounts.get(r.customer_id) : undefined;
    const relayer = r.relayed_by ? accounts.get(r.relayed_by) : undefined;
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      author: displayName(r.author_name ?? account?.full_name ?? null),
      avatarUrl: account?.avatar_url ?? null,
      mealName: r.meal_id ? (meals.get(r.meal_id) ?? "A dish") : null,
      shopReply: r.shop_reply,
      isHidden: r.is_hidden,
      relayed: r.source === "relayed",
      relayedByName: relayer ? displayName(relayer.full_name) : null,
    };
  });

  const visible = reviews.filter((r) => !r.isHidden);
  const average = visible.length
    ? visible.reduce((s, r) => s + r.rating, 0) / visible.length
    : 0;
  const unanswered = visible.filter((r) => !r.shopReply).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className={hqTitle}>Reviews</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Customers can only review a dish they actually bought on a completed
          order, so anything posted here is real. Reviews sent to you on
          Messenger can be added below and are labelled as such.
        </p>
      </div>

      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-6 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
              Average
            </p>
            <p className="flex items-center gap-2">
              <span className="font-display text-3xl font-black text-ink-950">
                {average.toFixed(1)}
              </span>
              <Stars rating={average} size="md" />
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
              Published
            </p>
            <p className="font-display text-3xl font-black text-ink-950">
              {visible.length}
            </p>
          </div>
          {unanswered > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
                Not replied to
              </p>
              <p className="font-display text-3xl font-black text-brand-600">
                {unanswered}
              </p>
            </div>
          )}
        </div>
      )}

      {canRelay && <RelayedReviewForm meals={mealList} />}

      <p className="rounded-2xl bg-gold-50 px-5 py-3 text-sm text-ink-800 ring-1 ring-gold-400/40">
        Hiding is for abuse and spam — not for burying honest criticism. A
        hidden review stops counting towards your public rating, but the
        customer still sees their own, and you can show it again at any time.
      </p>

      <AdminReviewList reviews={reviews} canRelay={canRelay} />
    </div>
  );
}
