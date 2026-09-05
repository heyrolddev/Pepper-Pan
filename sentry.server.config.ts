/**
 * Sentry, on the server — and only if the shop has an account.
 *
 * Everything here is guarded on the DSN being present, exactly as the email
 * sender and the push keys already are in this codebase. With no DSN this
 * file initialises nothing, sends nothing, and costs nothing: the shop's own
 * error log carries on alone. Paste a DSN into the environment and the second
 * layer switches on with no code change.
 *
 * WHY BOTH THIS AND THE ERROR LOG
 *
 * They fail in different directions, which is the whole argument for keeping
 * the one that was already built:
 *
 *   The error log lives in the shop's own database. If that database is the
 *   thing that is down, it records nothing — and that is precisely the outage
 *   worth knowing about. Sentry is outside, so it still reports.
 *
 *   Sentry has source maps, so a stack points at the real line rather than at
 *   minified rubbish. The error log cannot do that.
 *
 *   The error log is free, needs no account, and is on the screen the owner
 *   already opens. Sentry is a bill and a login.
 *
 * Neither replaces the other, so neither was removed.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // A food stall's traffic is small and its errors are rare, so every error
    // is worth keeping. Performance traces are sampled hard because they are
    // the part that burns a free tier's quota in a week for information
    // nobody here is going to act on.
    tracesSampleRate: 0.05,
    // Off by default: session replay records what a customer did on the page,
    // which for a checkout means their name, address and phone. That is a
    // deliberate decision to make, not a default to inherit.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Local runs should not spend the shop's quota, and a fault on a laptop
    // is not a fault in the shop.
    enabled: process.env.NODE_ENV === "production",
    // Which deploy an error came from, so "this started on Tuesday" is
    // answerable. Vercel sets this for free.
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
