import "server-only";
import { getViewer, type Viewer } from "@/lib/auth";
import { pinnedBranchId } from "@/lib/branches";

/**
 * Narrowing a query to one branch, on the server.
 *
 * ── Why this exists as a named thing ─────────────────────────────────────
 *
 * HQ reads most of its figures with the service role, which bypasses
 * row-level security by design — that is how a back office sees numbers a
 * browser session may not. The consequence is that 0079's policies do NOT
 * scope those reads, and a dashboard query that forgets its branch filter
 * silently shows two branches blended together while looking like one.
 *
 * That is the single failure this whole feature can produce, and it is the
 * same shape as the deny-list bugs that cost this project twice already: a
 * missing `.eq("branch_id", …)` is valid code returning valid-looking
 * numbers, and no compiler will ever mention it.
 *
 * So the narrowing has a name, and every scoped read goes through it. A
 * grep for `onlyBranch` is then a list of every query that has thought about
 * the question — and a query that has not is visible by its absence.
 *
 * A query read through the USER session needs none of this: 0079 already
 * scopes it in the database. Only service-role reads do.
 */

/** Which branch this viewer's figures should cover, or null for all of them. */
export async function scopeBranch(viewer?: Viewer): Promise<string | null> {
  const v = viewer ?? (await getViewer());
  return pinnedBranchId({ branchId: v?.profile?.branch_id ?? null });
}

/**
 * Add the branch filter to a query, or leave it alone for somebody unpinned.
 *
 * The cast is deliberate and it is the narrow kind. Constraining the generic
 * to `{ eq(column, value): T }` reads better and TypeScript refuses it:
 * PostgREST's builder is recursive in its own type parameters, and asking it
 * to prove the constraint ends in "type instantiation is excessively deep".
 *
 * So the shape is asserted rather than proved, at exactly one place, for
 * exactly one method that every query builder in this codebase has. Passing
 * something without `.eq` is a runtime error here instead of a compile error
 * — which is why this function does one thing and is three lines long.
 */
export function onlyBranch<T>(query: T, branchId: string | null): T {
  if (branchId === null) return query;
  return (query as { eq(column: string, value: string): T }).eq("branch_id", branchId);
}
