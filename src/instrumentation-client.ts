/**
 * Sentry in the browser.
 *
 * This is the half the server hook cannot see: a component that throws while
 * hydrating, a handler that fails on one particular phone, a script blocked by
 * somebody's browser. The shop's own error log already catches what reaches an
 * error boundary; this catches what happens outside one.
 *
 * Guarded on the DSN like the rest. Note the variable is NEXT_PUBLIC_ — it has
 * to be, because this file ships to the browser. A Sentry DSN is designed to
 * be public; it identifies a project to send to and grants nothing.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    // See the server config: replay would record a customer typing their
    // address into checkout.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enabled: process.env.NODE_ENV === "production",
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

/** Navigation timing. Exported whether or not Sentry is on; it no-ops. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
