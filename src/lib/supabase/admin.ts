import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client — bypasses Row Level Security entirely.
 * Server-only (import 'server-only' throws if this ever ends up in a client bundle).
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Named, rather than left to supabase-js to say "supabaseUrl is required"
  // from somewhere three frames down. A missing variable in a deployment is a
  // five-second fix once you know WHICH variable — and a blank "a server
  // error occurred" page otherwise, which is where an afternoon goes.
  if (!url || !key) {
    throw new Error(
      `Supabase service credentials are missing: ${[
        !url && "NEXT_PUBLIC_SUPABASE_URL",
        !key && "SUPABASE_SERVICE_ROLE_KEY",
      ]
        .filter(Boolean)
        .join(" and ")} is not set in this environment. Every HQ screen that ` +
        `reads costs, stock or the day's takings needs it.`
    );
  }

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
