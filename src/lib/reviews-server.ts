import "server-only";
import { createClient } from "@/lib/supabase/server";
import { displayName, type PublicReview } from "@/components/review-list";

type Row = {
  id: string;
  customer_id: string;
  meal_id: string | null;
  rating: number;
  comment: string | null;
  shop_reply: string | null;
  created_at: string;
};

export type ReviewSummary = {
  reviews: PublicReview[];
  average: number;
  count: number;
};

const EMPTY: ReviewSummary = { reviews: [], average: 0, count: 0 };

/**
 * Published reviews, newest first, with author first names and dish names
 * resolved.
 *
 * RLS already filters hidden reviews out for the public, so this reads the
 * table directly rather than re-implementing that rule — one source of truth
 * for what's visible.
 */
export async function getPublicReviews(limit = 50): Promise<ReviewSummary> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("reviews")
      .select("id, customer_id, meal_id, rating, comment, shop_reply, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return EMPTY;
    const rows = data as Row[];
    if (rows.length === 0) return EMPTY;

    const customerIds = [...new Set(rows.map((r) => r.customer_id))];
    const mealIds = [...new Set(rows.map((r) => r.meal_id).filter(Boolean))] as string[];

    const [profilesRes, mealsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", customerIds),
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

    const reviews: PublicReview[] = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      author: displayName(names.get(r.customer_id) ?? null),
      mealName: r.meal_id ? (meals.get(r.meal_id) ?? "A dish") : null,
      shopReply: r.shop_reply,
    }));

    const total = reviews.reduce((s, r) => s + r.rating, 0);
    return {
      reviews,
      average: reviews.length ? total / reviews.length : 0,
      count: reviews.length,
    };
  } catch {
    return EMPTY;
  }
}
