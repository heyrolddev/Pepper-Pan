"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushToUser } from "@/lib/push";
import { cleanName } from "@/lib/staff-name";

type Result = { error: string | null };

/**
 * Change your own phone number.
 *
 * Self-service, with no approval, and that is a deliberate answer rather than
 * a shortcut. The number is contact information and nothing else here — it is
 * not used to sign in, not used to reset a password, and not used to send
 * anything. Somebody changing theirs gains no access.
 *
 * Making them ask the owner would be friction buying nothing, and it has a
 * cost that is easy to miss: people stop bothering, and the number on the
 * Staff screen quietly becomes wrong. A number that is out of date is worse
 * than one that changes, because the shop only finds out on the day it needs
 * to ring somebody.
 *
 * Logged, so the owner can still see every change that was made.
 */
export async function saveMyPhone(phone: string): Promise<Result> {
  const viewer = await getViewer();
  const id = viewer?.profile?.id;
  if (!id) return { error: "Sign in first." };

  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10) {
    return { error: "That doesn't look like a mobile number." };
  }

  const db = createAdminClient();
  const before = viewer.profile?.phone ?? "none";

  const { error } = await db.from("profiles").update({ phone: trimmed }).eq("id", id);
  if (error) return { error: error.message };

  await db.from("activity_log").insert({
    category: "staff",
    description: `"${viewer.profile?.full_name ?? id}" changed their number from ${before} to ${trimmed}`,
    actor: id,
  });

  // Not an approval — a notice. The owner should know the number they would
  // ring has moved, without having to be asked first.
  try {
    const { data: owners } = await db.from("profiles").select("id").eq("role", "owner");
    for (const o of owners ?? []) {
      if (o.id === id) continue;
      await pushToUser(o.id, {
        title: `${viewer.profile?.full_name ?? "Someone"} changed their number`,
        body: trimmed,
        url: "/admin/staff",
        tag: "phone-changed",
      });
    }
  } catch {
    /* the change is saved either way */
  }

  revalidatePath("/admin/me");
  revalidatePath("/admin/staff");
  return { error: null };
}

/**
 * Change the name this person is known by.
 *
 * WHY THIS IS THE NAME ON THE TILL
 *
 * Nothing else was ever a name. `logged_by` on a sale falls back to the email
 * when the profile has no `full_name`, so a shop whose account was opened as
 * `heyrolddev@…` had "heyrolddev" printed against every walk-in it rang up.
 * Not wrong, exactly — but it is a username on a receipt where a person's
 * name belongs, and there was no screen anywhere that could change it.
 *
 * WHY THE OLD RECORDS DO NOT MOVE
 *
 * `orders.logged_by` is text, stamped at the moment of the sale — the same
 * rule as `price_at_sale` and `order_line_extras.label`. So renaming yourself
 * today leaves yesterday's sales saying exactly who rang them up yesterday,
 * which is what makes a shift report evidence rather than a guess. Nothing is
 * rewritten and nothing needs to be.
 *
 * The activity log is the one place that reads the other way: it stores the
 * profile id and resolves the name when it is read, so old lines will show
 * the new name. That is the right answer there — a person who corrected their
 * name is the same person who did the thing.
 *
 * WHY IT IS SELF-SERVICE
 *
 * Same reasoning as the phone above, and the same safeguards: the change is
 * logged with both the old and the new name, and the owner is told. A staff
 * member cannot use it to gain anything — the profile id is who they are, and
 * that does not move — and the alternative, asking the owner every time, is
 * how the Staff screen quietly fills up with names nobody has corrected.
 */
export async function saveMyName(name: string): Promise<Result> {
  const viewer = await getViewer();
  const id = viewer?.profile?.id;
  if (!id) return { error: "Sign in first." };

  // The rules live in `staff-name` so they can be tested — this ends up on
  // paper in a customer's hand.
  const checked = cleanName(name);
  if (checked.error) return { error: checked.error };
  const trimmed = checked.name;

  const db = createAdminClient();
  const before = viewer.profile?.full_name?.trim() || viewer.email;
  if (trimmed === before) return { error: null };

  const { error } = await db.from("profiles").update({ full_name: trimmed }).eq("id", id);
  if (error) return { error: error.message };

  await db.from("activity_log").insert({
    category: "staff",
    description: `"${before}" is now shown as "${trimmed}"`,
    actor: id,
  });

  // A notice, not an approval — the owner should know the name on the shift
  // report has changed without having to be asked first.
  try {
    const { data: owners } = await db.from("profiles").select("id").eq("role", "owner");
    for (const o of owners ?? []) {
      if (o.id === id) continue;
      await pushToUser(o.id, {
        title: `${before} is now "${trimmed}"`,
        body: "The name on the till and the shift report has changed.",
        url: "/admin/staff",
        tag: "name-changed",
      });
    }
  } catch {
    /* the change is saved either way */
  }

  revalidatePath("/admin/me");
  revalidatePath("/admin/staff");
  revalidatePath("/admin/counter");
  return { error: null };
}

/**
 * Change somebody else's sign-in email. Owner only.
 *
 * Staff cannot change their own, and that is the whole design rather than an
 * omission. The email is the sign-in and the password-reset address, so
 * letting an account move its own would mean the classic account takeover:
 * change the address, then "forget" the password. Guarding that properly
 * needs a request, an approval, and a confirmation sent to the new address —
 * a lot of machinery, and a lot of new ways to fail, for something that
 * happens perhaps once in the life of a stall.
 *
 * What actually happens is somebody loses access to their email and cannot
 * get in. The owner is standing there every day, and they are the answer.
 * One screen, one action, no new door.
 */
export async function setStaffEmail(input: {
  profileId: string;
  email: string;
}): Promise<Result> {
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "owner") {
    return { error: "Only the owner can change a sign-in email." };
  }

  const email = input.email.trim().toLowerCase();
  // Deliberately loose. A stricter pattern rejects addresses that are
  // perfectly valid, and the real check is whether they can sign in with it.
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { error: "That doesn't look like an email address." };
  }
  if (input.profileId === viewer.profile?.id) {
    return {
      error:
        "Change your own email from the Supabase dashboard — doing it here could sign you out with nobody left to fix it.",
    };
  }

  const db = createAdminClient();
  const { data: target } = await db
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", input.profileId)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };
  if (target.role === "owner") {
    return { error: "Another owner changes their own email." };
  }

  const { error } = await db.auth.admin.updateUserById(input.profileId, {
    email,
    // Confirmed outright: the owner is doing this in person, for somebody
    // they employ, usually because that person cannot reach the old address.
    // A confirmation link sent to an inbox they may not have yet would leave
    // the account unreachable from both addresses.
    email_confirm: true,
  });
  if (error) return { error: error.message };

  await db.from("activity_log").insert({
    category: "staff",
    description: `Changed the sign-in email for "${target.full_name ?? input.profileId}" to ${email}`,
    actor: viewer.profile?.id ?? null,
  });

  revalidatePath("/admin/staff");
  return { error: null };
}
