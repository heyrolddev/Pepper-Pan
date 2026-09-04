import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { deviceLabel, type DeviceStatus } from "@/lib/devices";
import { pushToUser } from "@/lib/push";
import type { Role } from "@/lib/permissions";

export type DeviceRow = {
  id: string;
  user_id: string;
  device_id: string;
  label: string | null;
  status: DeviceStatus;
  first_seen: string;
  last_seen: string;
};

/**
 * Whether this browser may open HQ, deciding it if nobody has yet.
 *
 * Three rules, and the first one is the one that matters most:
 *
 *   The owner is never gated. They are the only person who can approve
 *   anybody, so an owner locked out of a new device locks out the whole
 *   shop, permanently, with no way back in. A device limit that can brick
 *   the business is worse than no device limit.
 *
 *   A person's first device is approved on sight. There is nobody to ask on
 *   a first sign-in, and a rule that cannot be satisfied is a wall.
 *
 *   Any device after that waits for the owner. Manager and staff work from
 *   one device; a second one is either them upgrading their phone, or it is
 *   not them at all, and the owner is the person who knows which.
 *
 * Idempotent: called on every HQ page load, and only writes when something
 * has actually changed.
 */
export async function checkDevice(
  userId: string,
  deviceId: string,
  userAgent: string | null,
  role: Role
): Promise<DeviceStatus> {
  if (role === "owner") return "approved";

  const db = createAdminClient();
  const label = deviceLabel(userAgent);

  const { data: existing } = await db
    .from("device_sessions")
    .select("id, status")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (existing) {
    // Touched rather than rewritten: `last_seen` is what tells the owner
    // which entry in the list is the phone actually in use.
    await db
      .from("device_sessions")
      .update({ last_seen: new Date().toISOString(), label })
      .eq("id", existing.id);
    return existing.status as DeviceStatus;
  }

  const { count } = await db
    .from("device_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "approved");

  const first = (count ?? 0) === 0;
  const status: DeviceStatus = first ? "approved" : "pending";

  await db.from("device_sessions").insert({
    user_id: userId,
    device_id: deviceId,
    label,
    status,
    ...(first ? { decided_at: new Date().toISOString() } : {}),
  });

  if (!first) {
    // The owner has to be told, or the request sits in a screen nobody has
    // a reason to open. Swallows its own failures: a push that does not send
    // must not stop the sign-in attempt being recorded, because the record
    // is what the owner acts on when they do look.
    try {
      const { data: who } = await db
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      const name = who?.full_name?.trim() || "Someone on your team";
      await notifyOwners(
        `🔐 ${name} is signing in on a new device`,
        `${label}. Let them in, or don't — nothing opens until you say.`,
        "/admin/staff"
      );
    } catch {
      /* the row is written; the owner will see it on the Staff screen */
    }
  }

  return status;
}

/** Push to every owner. There is normally one, and the plural costs nothing. */
async function notifyOwners(title: string, body: string, url: string) {
  const db = createAdminClient();
  const { data: owners } = await db
    .from("profiles")
    .select("id")
    .eq("role", "owner");
  for (const o of owners ?? []) {
    await pushToUser(o.id, { title, body, url, tag: "device-request" });
  }
}

/** Everything the Staff screen needs to decide. */
export async function listDevices(): Promise<DeviceRow[]> {
  const { data } = await createAdminClient()
    .from("device_sessions")
    .select("id, user_id, device_id, label, status, first_seen, last_seen")
    .order("last_seen", { ascending: false });
  return (data ?? []) as DeviceRow[];
}

export async function pendingDeviceCount(): Promise<number> {
  const { count } = await createAdminClient()
    .from("device_sessions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
