"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can, getViewer, isStaff } from "@/lib/auth";
import { prepareRelayedReview } from "@/lib/reviews";

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

/* ============================================================
 * Reviews that arrived somewhere else
 *
 * Customers send their reviews to the stall's Messenger, and until now those
 * words lived in a chat thread nobody else could see. This lets the owner put
 * them on the page.
 *
 * It is the one feature in this codebase that has to be built defensively
 * against its own owner, because the mechanism for "type in a review a
 * customer sent us" is identical to the mechanism for "invent a review". So:
 * the row records that it was relayed and who relayed it, every card that
 * shows it says so, and the reviews page no longer claims that every review
 * on it was posted by the customer themselves — because that would have
 * stopped being true.
 *
 * What that buys is worth more than the shortcut. A page with 40 reviews,
 * four of them openly marked as forwarded from a chat, is more believable
 * than a page with 40 reviews and a promise.
 * ============================================================ */

export async function addRelayedReview(input: {
  authorName: string;
  mealId: string | null;
  rating: number;
  comment: string;
  /** The day they actually sent it, as YYYY-MM-DD. Blank means today. */
  receivedOn: string;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "reviews.relay")) {
    return { error: "Only the owner can add a review that came in by Messenger." };
  }

  // Every rule about what may be typed lives in `reviews.ts`, where it can be
  // tested without a database. This function is left with the two things only
  // a server can answer: who is asking, and what the database says.
  const checked = prepareRelayedReview(input);
  if ("error" in checked) return { error: checked.error };
  const { authorName, rating, comment, createdAt } = checked.review;

  // The caller's own session, not the service role: `relayed_by` is stamped
  // from `auth.uid()` by the trigger in 0039, and the service role has no
  // `auth.uid()`. A relayed review with nobody's name against it is exactly
  // the thing this feature must not be able to produce.
  const { data, error } = await (await createClient())
    .from("reviews")
    .insert({
      source: "relayed",
      customer_id: null,
      author_name: authorName,
      meal_id: input.mealId,
      rating,
      comment,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select("id");

  if (error) {
    if (error.code === "42501") {
      return { error: "The database refused that. Only the owner can relay a review." };
    }
    if (error.message.includes("source") || error.message.includes("author_shape")) {
      return {
        error:
          "The database doesn't know about relayed reviews yet. Run migration 0039 in the Supabase SQL Editor.",
      };
    }
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return {
      error:
        "The database didn't accept that. Run migration 0039 in the Supabase SQL Editor.",
    };
  }

  revalidateReviews();
  return { error: null };
}

/**
 * Delete a relayed review outright.
 *
 * Hide is the tool for a customer's own words — theirs to have written, and
 * the shop's to stop showing. A relayed review is the shop's own typing, so a
 * misspelt name or the wrong dish is a mistake to erase rather than to hide.
 * The `source` filter is what keeps this button from ever reaching a
 * customer's review, whatever id is sent to it.
 */
export async function deleteRelayedReview(id: string): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "reviews.relay")) {
    return { error: "Only the owner can remove a relayed review." };
  }

  const { data, error } = await (await createClient())
    .from("reviews")
    .delete()
    .eq("id", id)
    .eq("source", "relayed")
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "That one isn't a relayed review — hide it instead of deleting it." };
  }

  revalidateReviews();
  return { error: null };
}
