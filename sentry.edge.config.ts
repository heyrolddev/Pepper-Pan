/**
 * The same, for the Edge runtime — middleware and any edge route.
 *
 * A separate file because the two runtimes load separately; Next imports
 * whichever matches. See `sentry.server.config.ts` for why any of this is
 * guarded on the DSN.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    enabled: process.env.NODE_ENV === "production",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
