"use server";

import { can, getViewer } from "@/lib/auth";
import { loadActivity, type Activity } from "@/lib/activity-server";

/**
 * Looking further back than the page loaded with.
 *
 * The page arrives with the most recent few hundred lines, which covers
 * every ordinary question. A date range asks the database again rather than
 * filtering what is already in the browser, because the answer to "what
 * happened last March" is not in there and filtering to nothing would look
 * exactly like "nothing happened".
 */
export async function loadMoreActivity(input: {
  from: string;
  to: string;
  category: string;
}): Promise<{ rows: Activity[]; error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) return { rows: [], error: null };

  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  // A backwards range is a slip, not an instruction — read it the way they
  // meant, the same way the sales date picker does.
  let from = isDate(input.from) ? input.from : undefined;
  let to = isDate(input.to) ? input.to : undefined;
  if (from && to && from > to) [from, to] = [to, from];

  return loadActivity({
    from,
    to,
    category: input.category || undefined,
    limit: 500,
  });
}
