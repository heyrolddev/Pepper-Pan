import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Writing down what broke.
 *
 * The rule this file exists to obey, above everything else: **it must never
 * throw**. It runs on the error path, and an error reporter that fails takes
 * the original error with it — turning a page that would have shown "sorry,
 * something went wrong" into a blank screen and a log line about the logger.
 * Every function here swallows its own failures into `console.error` and
 * returns.
 */

/** Longer than this and it is a novel, not a message. */
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

/**
 * Errors Next throws as control flow, which are not errors.
 *
 * `redirect()` and `notFound()` work by throwing. Every single redirect in the
 * app — every sign-in bounce, every guard on an admin page — arrives at
 * `onRequestError` looking exactly like a fault. Without this filter the log
 * fills with thousands of "NEXT_REDIRECT" rows within a day and the one real
 * error is somewhere underneath them.
 *
 * Matched on the digest prefix rather than the whole string, because both
 * carry a payload after a semicolon: the destination for a redirect, the
 * status code for a 404.
 */
const CONTROL_FLOW = ["NEXT_REDIRECT", "NEXT_HTTP_ERROR_FALLBACK"];

export function isControlFlow(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  const prefix = digest.split(";")[0];
  return CONTROL_FLOW.includes(prefix);
}

/**
 * What makes two errors the same error.
 *
 * Message plus route, and nothing else. Not the timestamp, not the customer,
 * not the stack — those differ between two occurrences of one fault, and a
 * fingerprint that includes them defeats the grouping that makes this table
 * usable at all.
 *
 * Digits are flattened to `#`, so "Ingredient 4f21 not found" and
 * "Ingredient 9c03 not found" are one problem rather than one problem per
 * ingredient. That is the difference between a screen saying "this is broken
 * 93 times" and a screen with 93 rows saying the same thing.
 */
export function fingerprintOf(message: string, route: string | null): string {
  const flattened = message
    .slice(0, MAX_MESSAGE)
    // Any long token carrying both letters and digits: a uuid, a hash, or one
    // of this shop's own `mt9svomb0ynv2` ids. Written as "letters and digits"
    // rather than as a hex pattern because the ids here are base-36 and a hex
    // rule silently misses them — which was caught by a test that failed
    // exactly once, on a real message shape from the imported data.
    // English words do not contain digits, so this does not eat prose.
    .replace(/\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{8,}\b/gi, "#")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${route ?? "?"}::${flattened}`;
}

/** A readable message out of whatever was thrown. */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error).slice(0, MAX_MESSAGE);
  } catch {
    return "An unknown error";
  }
}

export type ErrorKind = "server" | "action" | "client";

/**
 * Record one error, grouped with its like.
 *
 * The insert goes through a Postgres function rather than a read-then-write
 * from here, so two requests hitting the same fault in the same instant
 * cannot race each other into a duplicate-key failure — inside the error
 * handler, which is the worst place to have one.
 */
export async function recordError(input: {
  error: unknown;
  route: string | null;
  kind: ErrorKind;
}): Promise<void> {
  try {
    if (isControlFlow(input.error)) return;

    const message = messageOf(input.error).slice(0, MAX_MESSAGE);
    if (!message) return;

    const digest =
      input.error && typeof input.error === "object" && "digest" in input.error
        ? String((input.error as { digest: unknown }).digest).slice(0, 200)
        : null;

    const stack =
      input.error instanceof Error && input.error.stack
        ? input.error.stack.slice(0, MAX_STACK)
        : null;

    const db = createAdminClient();
    const { error } = await db.rpc("record_error", {
      p_fingerprint: fingerprintOf(message, input.route),
      p_message: message,
      p_route: input.route,
      p_kind: input.kind,
      p_digest: digest,
      p_stack: stack,
    });
    if (error) console.error(`[error-log] could not record: ${error.message}`);
  } catch (e) {
    // Never rethrown. See the note at the top of this file.
    console.error(
      `[error-log] the reporter itself failed: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
}

export type LoggedError = {
  id: string;
  message: string;
  route: string | null;
  kind: ErrorKind;
  stack: string | null;
  first_seen: string;
  last_seen: string;
  times: number;
  resolved: boolean;
};

/**
 * The open faults, newest first.
 *
 * Returns an empty list on failure rather than throwing: this feeds a panel
 * on a screen the owner needs for other things, and a broken error list must
 * not become the thing that breaks the page about broken things.
 */
export async function listErrors(limit = 50): Promise<LoggedError[]> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("error_log")
      .select("id, message, route, kind, stack, first_seen, last_seen, times, resolved")
      .order("resolved", { ascending: true })
      .order("last_seen", { ascending: false })
      .limit(limit);
    if (error) {
      console.error(`[error-log] could not list: ${error.message}`);
      return [];
    }
    return (data ?? []) as LoggedError[];
  } catch {
    return [];
  }
}

/** How many faults are open, for the badge in the sidebar. */
export async function countOpenErrors(): Promise<number> {
  try {
    const db = createAdminClient();
    const { count, error } = await db
      .from("error_log")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
