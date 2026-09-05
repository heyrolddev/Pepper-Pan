import type { Instrumentation } from "next";

/**
 * Every server-side error, on its way past.
 *
 * `onRequestError` is Next's one hook that sees a thrown error from anywhere
 * on the server — a Server Component that failed to render, a route handler,
 * a Server Action — including the ones that never reach a client error
 * boundary because the page died before it got there. Those are exactly the
 * failures nobody was finding out about.
 *
 * Two things this file is careful about:
 *
 *   The import is dynamic. `instrumentation.ts` is loaded in both the Node
 *   and the Edge runtime, and the recorder pulls in the Supabase service
 *   client — so importing it at the top would drag that into the Edge bundle
 *   for every request, error or not.
 *
 *   Only `path` is taken from the request. The `headers` this hook is handed
 *   include cookies, which means the session token: writing them into a table
 *   would turn an error log into a way to become somebody else.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { recordError } = await import("@/lib/error-log");
  await recordError({
    error,
    // The route as the owner would name it — `/admin/money` — falling back to
    // the file path when the request path is missing.
    route: request.path ?? context.routePath ?? null,
    kind: context.routeType === "action" ? "action" : "server",
  });
};
