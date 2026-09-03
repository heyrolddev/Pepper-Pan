"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, isStaff } from "@/lib/auth";

const NOT_ELIGIBLE =
  "You can only review something you've actually ordered and received. Once an order is completed, you'll be able to rate it here.";

function revalidateReviews() {
  revalidatePath("/reviews");
  revalidatePath("/orders");
  revalidatePath("/menu");
  revalidatePath("/");
  revalidatePath("/admin/reviews");
}

/**
 * Leave or update a review. `mealId` null rates the shop overall.
 *
 * Eligibility is enforced by RLS (`has_bought_meal` / `has_completed_order`),
 * so a rejected write here means the person genuinely hasn't bought it — this
 * just turns the policy refusal into a sentence.
 */
export async function saveReview(input: {
  mealId: string | null;
  rating: number;
  comment: string;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { error: "Please pick between 1 and 5 stars." };
  }
  const comment = input.comment.trim();
  if (comment.length > 1000) {
    return { error: "Please keep your review under 1000 characters." };
  }

  // The unique indexes make this one review per customer per dish, so an
  // existing one is updated rather than duplicated. `meal_id IS NULL` needs
  // `.is()`, not `.eq()`, which is why the two cases are separate.
  const base = supabase.from("reviews").select("id").eq("customer_id", user.id);
  const existing = await (input.mealId === null
    ? base.is("meal_id", null)
    : base.eq("meal_id", input.mealId)
  ).maybeSingle();

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from("reviews")
      .update({ rating: input.rating, comment: comment || null })
      .eq("id", existing.data.id)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: NOT_ELIGIBLE };
  } else {
    const { data, error } = await supabase
      .from("reviews")
      .insert({
        customer_id: user.id,
        meal_id: input.mealId,
        rating: input.rating,
        comment: comment || null,
      })
      .select("id");
    if (error) {
      // 42501 = RLS refusal, i.e. they haven't bought it.
      if (error.code === "42501") return { error: NOT_ELIGIBLE };
      if (error.code === "23505") {
        return { error: "You've already reviewed this — edit your review instead." };
      }
      return { error: error.message };
    }
    if (!data || data.length === 0) return { error: NOT_ELIGIBLE };
  }

  revalidateReviews();
  return { error: null };
}

/** Staff: publish a reply under a review. */
export async function replyToReview(
  id: string,
  reply: string
): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const trimmed = reply.trim();
  if (trimmed.length > 1000) {
    return { error: "Please keep your reply under 1000 characters." };
  }

  const { data, error } = await (await createClient())
    .from("reviews")
    .update({
      shop_reply: trimmed || null,
      shop_replied_at: trimmed ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return {
      error:
        "The database didn't accept that. Run migration 0009 in the Supabase SQL Editor.",
    };
  }

  revalidateReviews();
  return { error: null };
}

/**
 * Staff: hide a review from public view.
 *
 * Hiding is deliberately not deletion — the customer keeps seeing their own
 * review, and it can be un-hidden. Use it for abuse and spam, not for
 * burying honest criticism.
 */
export async function setReviewHidden(
  id: string,
  hidden: boolean
): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const { data, error } = await (await createClient())
    .from("reviews")
    .update({ is_hidden: hidden })
    .eq("id", id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return {
      error:
        "The database didn't accept that. Run migration 0009 in the Supabase SQL Editor.",
    };
  }

  revalidateReviews();
  return { error: null };
}
