import { createClient } from "@/lib/supabase/server";
import { AdminReviewList, type AdminReview } from "@/components/admin-review-list";
import { Stars } from "@/components/stars";
import { displayName } from "@/components/review-list";

type Row = {
  id: string;
  customer_id: string;
  meal_id: string | null;
  rating: number;
  comment: string | null;
  shop_reply: string | null;
  is_hidden: boolean;
  created_at: string;
};

export default async function AdminReviewsPage() {
  const supabase = await createClient();

  // Staff RLS returns hidden reviews too, which is the point of this page.
  const { data } = await supabase
    .from("reviews")
    .select("id, customer_id, meal_id, rating, comment, shop_reply, is_hidden, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as Row[];

  const customerIds = [...new Set(rows.map((r) => r.customer_id))];
  const mealIds = [...new Set(rows.map((r) => r.meal_id).filter(Boolean))] as string[];

  const [profilesRes, mealsRes] = await Promise.all([
    customerIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    mealIds.length
      ? supabase.from("meals").select("id, name").in("id", mealIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const names = new Map(
    ((profilesRes.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name,
    ])
  );
  const meals = new Map(
    ((mealsRes.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name])
  );

  const reviews: AdminReview[] = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
    author: displayName(names.get(r.customer_id) ?? null),
    mealName: r.meal_id ? (meals.get(r.meal_id) ?? "A dish") : null,
    shopReply: r.shop_reply,
    isHidden: r.is_hidden,
  }));

  const visible = reviews.filter((r) => !r.isHidden);
  const average = visible.length
    ? visible.reduce((s, r) => s + r.rating, 0) / visible.length
    : 0;
  const unanswered = visible.filter((r) => !r.shopReply).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-black text-ink-950">Reviews</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Only customers who&apos;ve received a completed order can review, and
          only the dishes they actually bought — so these are real.
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

      <p className="rounded-2xl bg-gold-50 px-5 py-3 text-sm text-ink-800 ring-1 ring-gold-400/40">
        Hiding is for abuse and spam — not for burying honest criticism. A
        hidden review stops counting towards your public rating, but the
        customer still sees their own, and you can show it again at any time.
      </p>

      <AdminReviewList reviews={reviews} />
    </div>
  );
}
