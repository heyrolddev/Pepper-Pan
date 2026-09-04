"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth";
import { pushToUser } from "@/lib/push";

export async function saveProfile(input: {
  fullName: string;
  phone: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  if (!input.fullName.trim()) return { error: "Please enter your name." };

  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) {
    return { error: "Please enter a working mobile number (e.g. 09XX XXX XXXX)." };
  }

  const lat =
    typeof input.lat === "number" && Number.isFinite(input.lat) && Math.abs(input.lat) <= 90
      ? input.lat
      : null;
  const lng =
    typeof input.lng === "number" && Number.isFinite(input.lng) && Math.abs(input.lng) <= 180
      ? input.lng
      : null;

  // role / is_verified / is_blocked are clamped by a database trigger, so a
  // customer can never escalate here even if this payload were tampered with.
  // `.select()` matters: an RLS-blocked UPDATE returns success with zero rows.
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      address: input.address.trim() || null,
      address_lat: lat,
      address_lng: lng,
    })
    .eq("id", user.id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "The database didn't accept that change." };
  }

  revalidatePath("/account");
  revalidatePath("/checkout");
  return { error: null };
}

/**
 * Take the job the owner offered.
 *
 * The whole reason a role is offered rather than applied: this is the moment
 * the person agreed, done from their own signed-in session, which is also
 * what proves the account is theirs. The offer is read from the database
 * rather than passed in — a role sent up from a browser is a role the
 * browser chose.
 */
export async function acceptRoleOffer(): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  const id = viewer?.profile?.id;
  if (!id) return { error: "Sign in first." };

  const db = createAdminClient();
  const { data: me } = await db
    .from("profiles")
    .select("id, full_name, role, pending_role")
    .eq("id", id)
    .maybeSingle();

  if (!me?.pending_role) {
    return { error: "There's no role waiting for you." };
  }
  // Between the offer being made and accepted the owner may have withdrawn
  // it, or made a different one. Whatever is in the row now is the offer.
  const role = me.pending_role;

  const { error } = await db
    .from("profiles")
    .update({
      role,
      pending_role: null,
      role_offered_at: null,
      role_offered_by: null,
    })
    .eq("id", id)
    // Only if the offer is still the one just read. Two taps on a slow
    // connection would otherwise apply it twice, and the second would be
    // applying an offer that no longer existed.
    .eq("pending_role", role);
  if (error) return { error: error.message };

  await db.from("activity_log").insert({
    category: "staff",
    description: `"${me.full_name ?? id}" accepted the ${role} role`,
    actor: id,
  });

  // The owner asked for this person to work here; they should know it took.
  try {
    const { data: owners } = await db
      .from("profiles")
      .select("id")
      .eq("role", "owner");
    for (const o of owners ?? []) {
      await pushToUser(o.id, {
        title: `${me.full_name ?? "They"} accepted`,
        body: `They're now ${role} and can open HQ.`,
        url: "/admin/staff",
        tag: "role-accepted",
      });
    }
  } catch {
    /* the role is theirs either way */
  }

  revalidatePath("/account");
  revalidatePath("/admin", "layout");
  return { error: null };
}

/** Say no. The offer goes away and nothing changes. */
export async function declineRoleOffer(): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  const id = viewer?.profile?.id;
  if (!id) return { error: "Sign in first." };

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ pending_role: null, role_offered_at: null, role_offered_by: null })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/account");
  return { error: null };
}
