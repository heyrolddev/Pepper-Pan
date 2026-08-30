import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  role: "owner" | "staff" | "customer";
  full_name: string | null;
  phone: string | null;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
  is_verified: boolean;
  is_blocked: boolean;
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
        "id, role, full_name, phone, address, address_lat, address_lng, is_verified, is_blocked"
      )
      .eq("id", user.id)
      .maybeSingle();

    return { email: user.email ?? "", profile: (profile as Profile) ?? null };
  } catch {
    return null;
  }
}

export function isStaff(viewer: Viewer) {
  return viewer?.profile?.role === "owner" || viewer?.profile?.role === "staff";
}

/** Statuses that mean "this order is still happening" for the customer. */
const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready", "out_for_delivery"];

/**
 * How many orders this customer has in flight.
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
      .in("status", ACTIVE_STATUSES);

    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}
