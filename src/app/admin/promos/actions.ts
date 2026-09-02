"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnnouncementKind } from "@/lib/announcements";

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
}): Promise<Result> {
  const viewer = await mayPost();
  if (!viewer) return { error: "Only the owner or a manager can post these." };

  const title = input.title.trim();
  if (!title) return { error: "Give it a title — that's the line customers read." };
  if (input.kind === "promo" && title.length > 60) {
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
  };

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
  const { error } = await createAdminClient().from("announcements").delete().eq("id", id);
  if (error) return { error: error.message };
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
