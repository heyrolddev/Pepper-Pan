"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth";
import { pushToUser } from "@/lib/push";
import {
  AVATAR_PREFIX,
  MEDIA_BUCKET,
  checkAvatarUpload,
  storagePathOf,
} from "@/lib/media";

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

/* ============================================================
 * The photo on the account
 *
 * Two steps, and the bytes only move in the second one — the same shape the
 * promo uploader uses. The server says who may upload and to exactly which
 * path, and hands back a token for that one path; the file then goes straight
 * from the phone to storage.
 *
 * It matters less here than it does for a 25MB video, because the browser has
 * already shrunk this to a few tens of kilobytes. It is still the right shape:
 * a server action's body limit is not a thing to be within by luck.
 * ============================================================ */

/** Where this person's own avatars live, and nowhere else. */
function avatarFolder(userId: string) {
  return `${AVATAR_PREFIX}/${userId}`;
}

export async function signAvatarUpload(input: {
  type: string;
  size: number;
}): Promise<
  { ok: true; path: string; token: string; url: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to sign in first." };

  const checked = checkAvatarUpload(input.type, input.size);
  if (!checked.ok) return { ok: false, error: checked.error };

  // A fresh filename every time rather than one fixed path per account. A
  // public bucket sits behind a CDN, so re-uploading to the same URL shows
  // the old photo for as long as that cache lives — the customer changes
  // their picture, nothing appears to happen, and they change it again.
  const path = `${avatarFolder(user.id)}/${crypto.randomUUID()}.${checked.ext}`;

  const db = createAdminClient();
  const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return {
      ok: false,
      error: `Could not start the upload: ${error?.message ?? "no token came back"}`,
    };
  }

  const { data: pub } = db.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { ok: true, path, token: data.token, url: pub.publicUrl };
}

/**
 * Point the account at an uploaded photo, and drop the one it replaces.
 *
 * The URL is checked against this account's own folder rather than taken on
 * trust: a URL is something the browser sends, and without that check the
 * field would accept any address on the internet as a profile picture, and
 * the shop's review cards would be loading images from wherever it pointed.
 */
export async function saveAvatar(url: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  const path = storagePathOf(url, avatarFolder(user.id));
  if (!path) return { error: "That isn't a photo uploaded to this account." };

  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return {
      error:
        "The database didn't accept that. Run migration 0039 in the Supabase SQL Editor.",
    };
  }

  const old = (before as { avatar_url: string | null } | null)?.avatar_url;
  if (old && old !== url) await dropAvatarFile(user.id, old);

  revalidateAvatar();
  return { error: null };
}

/** Take the photo off the account, and out of the bucket. */
export async function removeAvatar(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);
  if (error) return { error: error.message };

  const old = (before as { avatar_url: string | null } | null)?.avatar_url;
  if (old) await dropAvatarFile(user.id, old);

  revalidateAvatar();
  return { error: null };
}

/**
 * Delete a file, but only one of this account's own.
 *
 * Failing quietly is deliberate: the row is already pointing somewhere else,
 * and an orphaned 40KB file in a bucket is not worth showing the customer an
 * error about a photo they have already replaced.
 */
async function dropAvatarFile(userId: string, publicUrl: string) {
  const path = storagePathOf(publicUrl, avatarFolder(userId));
  if (!path) return;
  try {
    await createAdminClient().storage.from(MEDIA_BUCKET).remove([path]);
  } catch {
    /* the account no longer points at it either way */
  }
}

function revalidateAvatar() {
  revalidatePath("/account");
  // Their face is on their reviews, so every page that shows one is stale.
  revalidatePath("/reviews");
  revalidatePath("/menu");
  revalidatePath("/");
  revalidatePath("/admin/reviews");
}
