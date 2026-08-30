"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured, pushToUser } from "@/lib/push";

/**
 * Turning notifications on and off for one device.
 *
 * These live at a route with no page on purpose: both the owner's Alerts
 * screen and the customer's order list use the same three actions, and
 * duplicating them under each would mean two places to fix a permission bug.
 */

type Result = { error: string | null };

export type NewSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** "Chrome on Android" — so the owner can tell their phone from the till. */
  label: string | null;
};

/**
 * Remember this browser so we can reach it later.
 *
 * The endpoint is the device's identity, which makes re-subscribing on the
 * same browser an update rather than a second row — otherwise one phone would
 * buzz twice for one order. A shared phone signed into a different account is
 * the same story from the other side: the old row must go, and the caller
 * proving they hold this endpoint's keys is exactly the authority needed to
 * retire it.
 */
export async function savePushSubscription(
  sub: NewSubscription
): Promise<Result> {
  if (!pushConfigured()) {
    return { error: "Push notifications aren't set up on the server yet." };
  }
  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    return { error: "That subscription looks incomplete — please try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  // Clear whatever this device was before. Service role, because the row may
  // belong to a different account on a shared phone and RLS would (rightly)
  // hide it from this caller.
  await createAdminClient()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", sub.endpoint);

  // `.select()` matters: without it PostgREST reports success even when a
  // row-level security policy silently matched nothing.
  const { data, error } = await supabase
    .from("push_subscriptions")
    .insert({
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      label: sub.label?.slice(0, 80) ?? null,
    })
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length) {
    return {
      error:
        "The database didn't accept that. Run migration 0014 in the Supabase SQL Editor.",
    };
  }

  return { error: null };
}

/** Stop reaching this device. Only ever your own rows — RLS sees to that. */
export async function removePushSubscription(
  endpoint: string
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  return { error: error?.message ?? null };
}

/**
 * Prove it works, now, rather than at 6pm on a Friday.
 *
 * Notifications are the one feature you cannot check by looking at the
 * screen you set them up on — the phone has to buzz. Without this the first
 * real test is a live order.
 */
export async function sendTestPush(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  const sent = await pushToUser(user.id, {
    title: "Pepper Pan · test",
    body: "Ito ang hitsura ng notification. Gumagana. 🍜",
    url: "/",
    tag: "pepper-pan-test",
  });

  if (sent === 0) {
    return {
      error:
        "Nothing was delivered. Turn notifications on for this device first, then try again.",
    };
  }
  return { error: null };
}
