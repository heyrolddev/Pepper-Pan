"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushToUser } from "@/lib/push";

type Result = { error: string | null };

async function requireOwner() {
  const viewer = await getViewer();
  return can(viewer, "staff.manage") ? viewer : null;
}

/**
 * Who works here.
 *
 * There is no invite email, because there is no mail service and no budget
 * for one. The person signs up like any customer, and the owner promotes
 * them here — which has the useful side effect that the account already
 * exists and the password is theirs alone. Nobody shares a login.
 */
export async function setStaffRole(input: {
  profileId: string;
  /**
   * Manager sits between the two: runs a service, restocks, marks a dish sold
   * out — and still cannot change a price or see what anything earns.
   * "owner" is deliberately not offered. Handing over the whole business is
   * not a button on a list of names.
   */
  role: "manager" | "staff" | "customer";
}): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can change who works here." };
  if (input.profileId === owner.profile?.id) {
    return { error: "You can't change your own role." };
  }

  const supabase = createAdminClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone")
    .eq("id", input.profileId)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };
  if (target.role === "owner") {
    return { error: "You can't stand down another owner from here." };
  }

  // Standing someone down mid-shift would leave a shift open forever and the
  // takings unattributable, so the shift is closed first.
  if (input.role === "customer") {
    await supabase
      .from("staff_shifts")
      .update({ ended_at: new Date().toISOString(), note: "Closed — access removed" })
      .eq("staff_id", input.profileId)
      .is("ended_at", null);
  }

  // Standing someone down is immediate — access is removed, not offered.
  if (input.role === "customer") {
    const { error } = await supabase
      .from("profiles")
      .update({ role: "customer", pending_role: null, role_offered_at: null })
      .eq("id", input.profileId);
    if (error) return { error: error.message };

    await supabase.from("activity_log").insert({
      category: "staff",
      description: `Removed shop access from "${target.full_name ?? input.profileId}"`,
      actor: owner.profile?.id ?? null,
    });

    revalidatePath("/admin/staff");
    revalidatePath("/admin", "layout");
    return { error: null };
  }

  // A job is offered, not applied.
  //
  // Nobody should wake up with access to the shop's money screens because
  // somebody tapped a row on a list. The person accepts it on their own
  // account, which makes the moment they agreed a thing that happened rather
  // than a thing assumed — and it is their sign-in and their password, so
  // accepting is proof the account is actually theirs.
  //
  // The phone number is the gate on offering at all. It is the only way the
  // shop can reach a person when a shift falls through, and asking for it
  // afterwards means asking somebody who already has the access.
  if (!target.phone?.trim()) {
    return {
      error: `${
        target.full_name ?? "That account"
      } has no phone number saved. Ask them to add one on their account page first — the shop needs a way to reach whoever is on shift.`,
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      pending_role: input.role,
      role_offered_at: new Date().toISOString(),
      role_offered_by: owner.profile?.id ?? null,
    })
    .eq("id", input.profileId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    category: "staff",
    description: `Offered "${target.full_name ?? input.profileId}" the ${ROLE_LABELS[
      input.role as Role
    ].toLowerCase()} role`,
    actor: owner.profile?.id ?? null,
  });

  // Swallowed: an offer that fails to notify is still an offer, and it shows
  // on their account page the next time they open it.
  try {
    await pushToUser(input.profileId, {
      title: `You've been offered a role at Pepper Pan`,
      body: `${ROLE_LABELS[input.role as Role]} — open your account to accept it.`,
      url: "/account",
      tag: "role-offer",
    });
  } catch {
    /* the offer is stored either way */
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin", "layout");
  return { error: null };
}


/* ---------------- devices ---------------- */

/**
 * Let a device in, or turn it away.
 *
 * The owner decides, and only the owner: the point of the whole mechanism is
 * that a device cannot approve itself, so this runs on the service-role key
 * behind a capability check rather than through the requester's own session.
 */
export async function decideDevice(input: {
  deviceRowId: string;
  allow: boolean;
}): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can allow a device." };

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("device_sessions")
    .select("id, user_id, label")
    .eq("id", input.deviceRowId)
    .maybeSingle();
  if (!row) return { error: "That request is no longer there." };

  const { error } = await supabase
    .from("device_sessions")
    .update({
      status: input.allow ? "approved" : "declined",
      decided_at: new Date().toISOString(),
      decided_by: owner.profile?.id ?? null,
    })
    .eq("id", input.deviceRowId);
  if (error) return { error: error.message };

  const { data: who } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", row.user_id)
    .maybeSingle();

  await supabase.from("activity_log").insert({
    category: "staff",
    description: `${input.allow ? "Allowed" : "Refused"} ${
      row.label ?? "a device"
    } for "${who?.full_name ?? row.user_id}"`,
    actor: owner.profile?.id ?? null,
  });

  // Tell them, so an approval does not sit there while they wait on a screen
  // that will not change until they reload it.
  try {
    await pushToUser(row.user_id, {
      title: input.allow ? "Your new device is allowed" : "That device was refused",
      body: input.allow
        ? `${row.label ?? "It"} can open HQ now — reload the page.`
        : `${row.label ?? "That device"} can't open HQ. Ask the owner if this is wrong.`,
      url: "/admin",
      tag: "device-decision",
    });
  } catch {
    /* the decision is stored either way */
  }

  revalidatePath("/admin/staff");
  return { error: null };
}

/**
 * Take a device's access away after the fact.
 *
 * Separate from declining, because the situations are different: declining
 * answers a request nobody has acted on, and this ends access somebody has
 * been using. A lost phone is the case that matters, and it is the case
 * where the owner needs one obvious control rather than a list to reason
 * about.
 */
export async function revokeDevice(deviceRowId: string): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can remove a device." };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("device_sessions")
    .update({
      status: "declined",
      decided_at: new Date().toISOString(),
      decided_by: owner.profile?.id ?? null,
    })
    .eq("id", deviceRowId);
  if (error) return { error: error.message };

  revalidatePath("/admin/staff");
  return { error: null };
}

/**
 * Withdraw an offer nobody has accepted yet.
 *
 * Offers should not sit open forever — a role offered to somebody who never
 * came back is an account that could still claim shop access months later,
 * long after whatever conversation prompted it.
 */
export async function cancelRoleOffer(profileId: string): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can withdraw an offer." };

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ pending_role: null, role_offered_at: null, role_offered_by: null })
    .eq("id", profileId);
  if (error) return { error: error.message };

  revalidatePath("/admin/staff");
  return { error: null };
}
