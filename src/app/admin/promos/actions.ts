"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnnouncementKind } from "@/lib/announcements";
import { MEDIA_BUCKET, MEDIA_PREFIX, checkMedia, storagePathOf, type MediaKind } from "@/lib/media";

type Result = { error: string | null };

/**
 * Everywhere a promo or a news post shows.
 *
 * The homepage is statically rendered — it has to be, it is the page every
 * customer lands on — so it does not notice a database change by itself.
 * Busting it here is what makes a saved promo appear immediately rather than
 * whenever the page next happens to be rebuilt. The time-based revalidate on
 * the page handles the other half: a promo whose window closes at midnight
 * has to come down without anybody saving anything.
 */
function revalidatePublic() {
  revalidatePath("/");
  // The index is statically rendered too. Missing it here meant a promo went
  // up on the homepage and was absent from the page the homepage links to.
  revalidatePath("/news");
  revalidatePath("/admin/promos");
}

async function mayPost() {
  const viewer = await getViewer();
  return can(viewer, "announcements") ? viewer : null;
}

export async function saveAnnouncement(input: {
  /** Absent when creating. */
  id?: number;
  kind: AnnouncementKind;
  title: string;
  body: string;
  /** "YYYY-MM-DD" or empty. Empty means no bound. */
  startsOn: string;
  endsOn: string;
  isActive: boolean;
  /** Already uploaded, or empty for none. */
  imageUrl: string;
  videoUrl: string;
}): Promise<Result> {
  const viewer = await mayPost();
  if (!viewer) return { error: "Only the owner or a manager can post these." };

  const title = input.title.trim();
  if (!title) return { error: "Give it a title — that's the line customers read." };
  if ((input.kind === "promo" || input.kind === "coming_soon") && title.length > 60) {
    return {
      error: "That's long for the scrolling strip. Keep a promo under about 60 characters, and put the detail in the description.",
    };
  }
  if (title.length > 200) return { error: "That title is too long." };

  // A date-only string is read as midnight UTC, which in Manila is 8am the
  // same day — so a promo set to end "today" would stop at breakfast. Both
  // ends are pinned to the shop's own day instead: a start begins at 00:00
  // Manila, and an end runs to the very end of that date.
  const startsAt = input.startsOn ? `${input.startsOn}T00:00:00+08:00` : null;
  const endsAt = input.endsOn ? `${input.endsOn}T23:59:59+08:00` : null;

  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    return { error: "The end date is before the start date." };
  }

  const supabase = createAdminClient();
  const row = {
    kind: input.kind,
    title,
    body: input.body.trim() || null,
    starts_at: startsAt,
    ends_at: endsAt,
    is_active: input.isActive,
    image_url: input.imageUrl || null,
    video_url: input.videoUrl || null,
  };

  // A file the row no longer points at is a file nobody can ever reach again.
  // Cleared here rather than by a sweep later, because "later" is a job
  // nobody scheduled and storage is billed by the gigabyte.
  if (input.id) {
    const { data: before } = await supabase
      .from("announcements")
      .select("image_url, video_url")
      .eq("id", input.id)
      .maybeSingle();
    for (const [was, now] of [
      [before?.image_url, row.image_url],
      [before?.video_url, row.video_url],
    ] as const) {
      if (was && was !== now) await removeStored(supabase, was);
    }
  }

  const { error } = input.id
    ? await supabase.from("announcements").update(row).eq("id", input.id)
    : await supabase.from("announcements").insert({
        ...row,
        // New ones go last, so adding a promo never silently reorders the
        // strip somebody has already arranged.
        sort_order:
          ((
            await supabase
              .from("announcements")
              .select("sort_order")
              .eq("kind", input.kind)
              .order("sort_order", { ascending: false })
              .limit(1)
              .maybeSingle()
          ).data?.sort_order ?? 0) + 10,
      });

  if (error) return { error: error.message };
  revalidatePublic();
  return { error: null };
}

/** On or off, without opening the editor — the commonest change by far. */
export async function toggleAnnouncement(id: number, isActive: boolean): Promise<Result> {
  if (!(await mayPost())) return { error: "Not allowed." };
  const { error } = await createAdminClient()
    .from("announcements")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePublic();
  return { error: null };
}

/**
 * Gone for good.
 *
 * Offered because a promo, unlike an order, is not a record of anything that
 * happened — it is a piece of copy. Keeping every typo forever would make the
 * list unusable, and the list being readable is what stops the wrong promo
 * going live.
 */
export async function deleteAnnouncement(id: number): Promise<Result> {
  if (!(await mayPost())) return { error: "Not allowed." };
  const supabase = createAdminClient();

  // Read the media before the row goes, or the only pointer to those files
  // goes with it.
  const { data: row } = await supabase
    .from("announcements")
    .select("image_url, video_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return { error: error.message };
  for (const url of [row?.image_url, row?.video_url]) {
    if (url) await removeStored(supabase, url);
  }
  revalidatePublic();
  return { error: null };
}

/** Move one up or down the strip. */
export async function reorderAnnouncement(id: number, direction: -1 | 1): Promise<Result> {
  if (!(await mayPost())) return { error: "Not allowed." };
  const supabase = createAdminClient();

  const { data: me } = await supabase
    .from("announcements")
    .select("id, kind, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!me) return { error: "That one no longer exists." };

  // The neighbour on that side, within the same kind. Swapping with whatever
  // happens to be adjacent in the whole table would shuffle news into promos.
  const { data: neighbour } = await supabase
    .from("announcements")
    .select("id, sort_order")
    .eq("kind", me.kind)
    .order("sort_order", { ascending: direction === 1 })
    [direction === 1 ? "gt" : "lt"]("sort_order", me.sort_order)
    .limit(1)
    .maybeSingle();

  // Already at the end. Not an error — the button simply had nothing to do.
  if (!neighbour) return { error: null };

  await supabase
    .from("announcements")
    .update({ sort_order: neighbour.sort_order })
    .eq("id", me.id);
  await supabase
    .from("announcements")
    .update({ sort_order: me.sort_order })
    .eq("id", neighbour.id);

  revalidatePublic();
  return { error: null };
}

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * Delete one uploaded file, if it is one of ours.
 *
 * Never throws and never reports. A file left behind costs a few kilobytes; a
 * save that fails because the tidy-up failed costs the owner their copy.
 */
async function removeStored(supabase: Supabase, publicUrl: string) {
  const path = storagePathOf(publicUrl);
  if (!path) return;
  try {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  } catch {
    // Nothing to tell the owner. The row is already right.
  }
}

/**
 * Take a photo or a video and give back a URL the page can use.
 *
 * Uploaded through the service role, so the storage bucket never has to be
 * opened to browsers — a public write policy on the shop's only image bucket
 * would let anyone fill it.
 *
 * The type and size are checked here as well as in the browser. The browser
 * check is there so nobody waits two minutes to be told no; this one is the
 * one that actually holds, because a request does not have to come from our
 * own form.
 */
export async function uploadMedia(
  formData: FormData
): Promise<{ ok: true; url: string; kind: MediaKind } | { ok: false; error: string }> {
  if (!(await mayPost())) {
    return { ok: false, error: "Only the owner or a manager can add photos here." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file came through. Try picking it again." };
  }

  const checked = checkMedia(file.type, file.size);
  if (!checked.ok) return { ok: false, error: checked.error };

  const supabase = createAdminClient();
  const path = `${MEDIA_PREFIX}/${crypto.randomUUID()}.${checked.ext}`;

  try {
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

    if (error) {
      // Named, because the two likely causes have completely different fixes:
      // a bucket that does not exist is a setup problem, and a file over the
      // project's own limit is a "make it smaller" problem.
      return { ok: false, error: `Upload failed: ${error.message}` };
    }

    const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl, kind: checked.kind };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Drop a file that was uploaded but never saved onto a row. */
export async function discardUpload(publicUrl: string): Promise<Result> {
  if (!(await mayPost())) return { error: "Not allowed." };
  await removeStored(createAdminClient(), publicUrl);
  return { error: null };
}
