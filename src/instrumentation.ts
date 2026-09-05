import type { Instrumentation } from "next";

/**
 * Every server-side error, on its way past — into the shop's own log, and
 * into Sentry when the shop has an account.
 *
 * `onRequestError` is Next's one hook that sees a thrown error from anywhere
 * on the server — a Server Component that failed to render, a route handler,
 * a Server Action — including the ones that never reach a client error
 * boundary because the page died before it got there. Those are exactly the
 * failures nobody was finding out about.
 *
 * BOTH recorders run, and the order is deliberate: the shop's own log first,
 * because it is the one that always exists and the one the dashboard reads.
 * Sentry second, and only when configured.
 *
 * Two things this file is careful about:
 *
 *   The imports are dynamic. `instrumentation.ts` is loaded in both the Node
 *   and the Edge runtime, and the recorder pulls in the Supabase service
 *   client — so importing it at the top would drag that into the Edge bundle
 *   for every request, error or not.
 *
 *   Only `path` is taken from the request. The `headers` this hook is handed
 *   include cookies, which means the session token: writing them into a table
 *   would turn an error log into a way to become somebody else.
 */

/**
 * Loads whichever Sentry config matches the runtime this instance is running
 * in. Next calls this once per server start.
 */
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  // The shop's own log is Node-only: it writes through the Supabase service
  // client, which does not belong in the Edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recordError } = await import("@/lib/error-log");
    await recordError({
      error,
      // The route as the owner would name it — `/admin/money` — falling back
      // to the file path when the request path is missing.
      route: request.path ?? context.routePath ?? null,
      kind: context.routeType === "action" ? "action" : "server",
    });
  }

  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    // Sentry's own handler rather than `captureException`: it is what knows
    // how to attach the route, the runtime and the render phase, and how to
    // ignore the redirect and not-found errors Next throws as control flow.
    await Sentry.captureRequestError(error, request, context);
  }
};
