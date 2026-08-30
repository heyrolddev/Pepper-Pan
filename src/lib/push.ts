import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reaching a phone whose browser is closed.
 *
 * Every other channel in this system only works while someone is looking at
 * it. That is fine for a shop you sit in front of and fatal for one you run
 * from the stall: an order could land at 6pm and be found at 8, because
 * nothing rang.
 *
 * Web Push is the one way out that costs nothing. The "key" is a VAPID
 * keypair the shop generates itself — it identifies this site to the browser
 * vendors' push services, and it is not an account, a subscription or a
 * vendor relationship. Generate it once with
 *
 *     npx web-push generate-vapid-keys
 *
 * and store the pair as environment variables. No key, no push, and nothing
 * else breaks — the same bargain email makes.
 */

export function pushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * VAPID details are global state inside web-push, so set them once.
 *
 * The subject must be a mailto: or https: URL — push services use it to
 * reach the site's operator if a subscription starts misbehaving. The shop's
 * own contact page is a truthful answer and needs no extra configuration.
 */
let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:peppperpan@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  vapidReady = true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Where tapping the notification should land. */
  url: string;
  /**
   * Collapse key. Two updates about the same order replace each other rather
   * than stacking — a customer whose order moved three times wants the
   * current state on their lock screen, not a history of it.
   */
  tag?: string;
};

type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Deliver to a set of devices, and forget the ones that are gone.
 *
 * A subscription dies whenever someone clears site data, uninstalls the home
 * screen app, or revokes permission — and the push service says so with a
 * 404 or 410. Those are the only failures worth acting on: deleting the row
 * keeps the table honest. Everything else (a timeout, a 5xx from the push
 * service) is transient, and dropping the device over one bad night would
 * silently unsubscribe a working phone.
 */
async function deliver(
  subs: Subscription[],
  payload: PushPayload
): Promise<number> {
  if (subs.length === 0) return 0;

  ensureVapid();
  const db = createAdminClient();
  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 * 6 }
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(sub.id);
      }
    })
  );

  if (dead.length > 0) {
    await db.from("push_subscriptions").delete().in("id", dead);
  }
  if (sent > 0) {
    await db
      .from("push_subscriptions")
      .update({ last_sent_at: new Date().toISOString() })
      .in(
        "id",
        subs.filter((s) => !dead.includes(s.id)).map((s) => s.id)
      );
  }

  return sent;
}

async function subscriptionsFor(userIds: string[]): Promise<Subscription[]> {
  if (userIds.length === 0) return [];
  const db = createAdminClient();
  const { data } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  return (data as Subscription[]) ?? [];
}

/** Every device one person has turned notifications on for. */
export async function pushToUser(
  userId: string,
  payload: PushPayload
): Promise<number> {
  if (!pushConfigured()) return 0;
  try {
    return await deliver(await subscriptionsFor([userId]), payload);
  } catch {
    // A notification is a courtesy; it must never take down the thing that
    // triggered it. The order still moved.
    return 0;
  }
}

/**
 * Everyone who runs the shop.
 *
 * Deliberately every owner and staff device rather than one nominated phone:
 * the failure this exists to prevent is an order nobody saw, and a shop where
 * only one person's phone rings has simply moved the single point of failure.
 */
export async function pushToStaff(payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  try {
    const db = createAdminClient();
    const { data: staff } = await db
      .from("profiles")
      .select("id")
      .in("role", ["owner", "staff"]);

    const ids = (staff ?? []).map((s) => s.id as string);
    return await deliver(await subscriptionsFor(ids), payload);
  } catch {
    return 0;
  }
}
