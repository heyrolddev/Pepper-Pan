"use server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Is this mobile number already on an account?
 *
 * Asked BEFORE the signup is attempted, so the person gets a sentence next
 * to the field they typed rather than whatever Postgres says when the unique
 * index added in 0081 refuses the insert. That refusal happens inside
 * `handle_new_user`, a trigger on `auth.users`, so Supabase reports it as
 * "Database error saving new user" — true, unactionable, and alarming.
 *
 * The index is still the rule. This is only the polite version of it: two
 * people signing up on the same number in the same second would both pass
 * here and the second would still be refused by the database, which is the
 * correct order of priorities.
 *
 * Telling somebody their number is already registered is deliberate. It is
 * the same thing the sign-in page already tells them about their email, and
 * the alternative — a signup that fails for a reason nobody will say — ends
 * with the customer ringing the shop.
 */
export async function isPhoneTaken(phone: string): Promise<boolean> {
  const typed = phone.trim();
  if (!typed) return false;

  try {
    const supabase = createAdminClient();

    /* Normalised by the database rather than here, so this asks exactly the
       question the unique index answers. A second copy of the normalising
       rule in TypeScript is a second copy that drifts. */
    const { data, error } = await supabase.rpc("normalise_phone", { p: typed });
    if (error) return false;

    const normalised = typeof data === "string" ? data : null;
    if (!normalised) return false;

    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("phone", normalised);

    return (count ?? 0) > 0;
  } catch {
    // The database is the rule; this is the courtesy. If the courtesy fails,
    // let the signup proceed and be refused properly rather than blocking
    // somebody from making an account because a lookup timed out.
    return false;
  }
}
