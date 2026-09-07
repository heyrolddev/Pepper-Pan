import "server-only";
import { createClient } from "@/lib/supabase/server";
import { type PublicReview } from "@/components/review-list";
import { displayName } from "@/lib/reviews";

type Row = {
  id: string;
  customer_id: string | null;
  author_name: string | null;
  source: string;
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
 * Published reviews, newest first, with author names, photos and dish names
 * resolved.
 *
 * RLS already filters hidden reviews out for the public, so this reads the
 * table directly rather than re-implementing that rule — one source of truth
 * for what's visible.
 *
 * THE AUTHOR JOIN READS A VIEW, NOT `profiles`, AND THAT IS A FIX
 *
 * This used to read `profiles` with the visitor's own session. The policy on
 * that table is `id = auth.uid() or is_staff()`, so for a visitor who is not
 * signed in it returned no rows at all, and every review on the public page
 * rendered as "A customer" — quietly, because a missing name has a fallback.
 * A signed-in customer saw their own name and nobody else's.
 *
 * `review_authors` (migration 0039) is a narrow view that exposes the first
 * name and photo of people who have actually published a review, and nothing
 * else about them. Reading it here is what makes both the name and the new
 * photo appear for the people the reviews page is actually for.
 */
export async function getPublicReviews(limit = 50): Promise<ReviewSummary> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("reviews")
      .select(
        "id, customer_id, author_name, source, meal_id, rating, comment, shop_reply, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return EMPTY;
    const rows = data as Row[];
    if (rows.length === 0) return EMPTY;

    // A relayed review carries its author's name on the row and has no
    // account behind it, so only the ones with a customer need looking up.
    const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
    const mealIds = [...new Set(rows.map((r) => r.meal_id).filter(Boolean))] as string[];

    const [authorsRes, mealsRes] = await Promise.all([
      customerIds.length
        ? supabase
            .from("review_authors")
            .select("id, full_name, avatar_url")
            .in("id", customerIds)
        : Promise.resolve({
            data: [] as { id: string; full_name: string | null; avatar_url: string | null }[],
          }),
      mealIds.length
        ? supabase.from("meals").select("id, name").in("id", mealIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const authors = new Map(
      (
        (authorsRes.data ?? []) as {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
        }[]
      ).map((a) => [a.id, a])
    );
    const meals = new Map(
      ((mealsRes.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name])
    );

    const reviews: PublicReview[] = rows.map((r) => {
      const author = r.customer_id ? authors.get(r.customer_id) : undefined;
      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        author: displayName(r.author_name ?? author?.full_name ?? null),
        avatarUrl: author?.avatar_url ?? null,
        mealName: r.meal_id ? (meals.get(r.meal_id) ?? "A dish") : null,
        shopReply: r.shop_reply,
        relayed: r.source === "relayed",
      };
    });

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
