/**
 * What Supabase says when a sign-in link does not work.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * A password-reset link that fails does not land on a page this app wrote.
 * Supabase bounces the browser to the project's Site URL with the reason in
 * the query string AND again in the hash:
 *
 *   /?error=access_denied&error_code=otp_expired&error_description=Email+link
 *     +is+invalid+or+has+expired#error=access_denied&error_code=otp_expired…
 *
 * So the customer asks to reset their password, clicks the link in their
 * email, and arrives at the homepage with a URL full of jargon and nothing
 * on the page acknowledging that anything happened. They try again, get the
 * same thing, and conclude the shop is broken. Nothing in the app had ever
 * read these parameters.
 *
 * This turns them into a sentence and a way forward.
 */

export type AuthLinkError = {
  code: string;
  /** What to tell the person, in their terms. */
  message: string;
  /** Does asking for a fresh link fix it? */
  retryable: boolean;
};

/**
 * The reasons worth their own wording.
 *
 * Everything else falls through to a generic line that still says what to
 * do — an unknown code is not a reason to show somebody a raw error string.
 */
const SAID: Record<string, { message: string; retryable: boolean }> = {
  otp_expired: {
    message:
      "That link has expired. Reset links only last a short while and can be used once — ask for a new one and use it straight away.",
    retryable: true,
  },
  access_denied: {
    message:
      "That link did not work. It may have expired, or it may already have been used — ask for a new one.",
    retryable: true,
  },
  server_error: {
    message:
      "Something went wrong at our end while checking that link. Please ask for a new one.",
    retryable: true,
  },
  validation_failed: {
    message: "That link is incomplete. Please ask for a new one.",
    retryable: true,
  },
};

/**
 * Pull the error out of a URL's query string and hash, or null.
 *
 * Both are read because Supabase writes it to both, and which one survives
 * depends on the flow — the implicit flow puts it in the hash, the PKCE
 * flow in the query. Reading one and not the other is a bug that only shows
 * up for half of them, which is the hardest kind to notice.
 *
 * The query wins when they disagree: a server could have seen it, so it is
 * the one less likely to be a leftover from an earlier navigation.
 */
export function readAuthError(search: string, hash: string): AuthLinkError | null {
  const fromHash = new URLSearchParams(hash.replace(/^#/, ""));
  const fromQuery = new URLSearchParams(search.replace(/^\?/, ""));

  const pick = (key: string) => fromQuery.get(key) ?? fromHash.get(key);

  const code = pick("error_code") ?? pick("error");
  if (!code) return null;

  const known = SAID[code];
  if (known) return { code, ...known };

  /* An unknown code, said plainly. Supabase's own `error_description` is
     readable enough to pass on — "Email link is invalid or has expired" is
     a sentence — but it arrives plus-encoded and is not always present. */
  const described = pick("error_description")?.replace(/\+/g, " ").trim();
  return {
    code,
    message: described
      ? `${described}. Please ask for a new link.`
      : "That link did not work. Please ask for a new one.",
    retryable: true,
  };
}
