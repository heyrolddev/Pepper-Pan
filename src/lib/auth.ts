import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORDER_STATUSES } from "@/lib/orders";
import { isShopRole, roleCan, type Capability } from "@/lib/permissions";

export type Profile = {
  id: string;
  role: "owner" | "manager" | "staff" | "customer";
  full_name: string | null;
  phone: string | null;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
  is_verified: boolean;
  is_blocked: boolean;
  /** A role the owner has offered and this person has not accepted yet. */
  pending_role: "owner" | "manager" | "staff" | null;
};

export type Viewer = { email: string; profile: Profile | null } | null;

export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** The signed-in user plus their profile row, or null when signed out. */
export async function getViewer(): Promise<Viewer> {
  if (!isConfigured()) return null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "id, role, full_name, phone, address, address_lat, address_lng, is_verified, is_blocked, pending_role"
      )
      .eq("id", user.id)
      .maybeSingle();

    return { email: user.email ?? "", profile: (profile as Profile) ?? null };
  } catch {
    return null;
  }
}

/** Does this person work here at all? The door, not the permission. */
export function isStaff(viewer: Viewer) {
  return isShopRole(viewer?.profile?.role);
}

/**
 * The permission.
 *
 * Every server action and every page that guards something should ask this
 * and name a capability, rather than comparing a role string. `isStaff` only
 * answers "is this one of ours" — which is the right question for keeping the
 * shop out of its own cart, and the wrong one for deciding whether they may
 * see what the chicken cost.
 */
export function can(viewer: Viewer, what: Capability): boolean {
  return roleCan(viewer?.profile?.role, what);
}

/** Statuses that mean "this order is still happening" for the customer. */


/**
 * How many orders this customer has in flight.
 *
 * Shares one list with the owner's badge rather than keeping a second copy.
 * The two were identical strings in two files, which is fine right up until
 * someone adds a status to one of them — and then the customer's header and
 * HQ disagree about what "in flight" means, silently and in opposite
 * directions.
 *
 * Drives the badge on "My orders" — a stall's customers order and then close
 * the tab, and a number in the header is what brings them back to the
 * countdown instead of ringing the shop.
 */
export async function countActiveOrders(): Promise<number> {
  if (!isConfigured()) return 0;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;

    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .in("status", ACTIVE_ORDER_STATUSES);

    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Send shop staff away from the customer's side of the site.
 *
 * The shop can't be its own customer: an owner order lands in the kitchen
 * queue, counts toward the day's takings and shows up in analytics, so a few
 * taps while testing become sales the shop never made.
 *
 * Guarded in a layout rather than each page, because a layout runs before the
 * page renders whether that page is a server or a client component — /cart is
 * a client component and could not check for itself.
 *
 * This is convenience, not security. The button being hidden and the page
 * redirecting only shape what's easy; `createOrder` is what actually refuses.
 */
export async function redirectStaffToHQ(): Promise<void> {
  const viewer = await getViewer();
  if (isStaff(viewer)) redirect("/admin");
}
