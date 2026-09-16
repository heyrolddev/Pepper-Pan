/**
 * Sentry in the browser — loaded late, on purpose.
 *
 * This is the half the server hook cannot see: a component that throws while
 * hydrating, a handler that fails on one particular phone, a script blocked by
 * somebody's browser. The shop's own error log already catches what reaches an
 * error boundary; this catches what happens outside one.
 *
 * Guarded on the DSN like the rest. Note the variable is NEXT_PUBLIC_ — it has
 * to be, because this file ships to the browser. A Sentry DSN is designed to
 * be public; it identifies a project to send to and grants nothing.
 *
 * WHY THIS IS NOT A PLAIN `import`
 *
 * It used to be one, and that cost every visitor 139 KB gzipped — 448 KB
 * unpacked — before the page could finish loading. Measured on the homepage,
 * that was 36% of all the JavaScript on it, more than React and the whole
 * shop put together. And it was paid whether or not the DSN was even set: an
 * `if (dsn)` around `Sentry.init` stops the SDK *running*, but a static import
 * has already been downloaded, parsed and executed by the time that line is
 * reached. A customer on mobile data outside the palengke paid for an error
 * tracker that, with no DSN, did nothing at all.
 *
 * So the SDK is fetched after the page is interactive, and the errors that
 * happen in the meantime are kept in the buffer below and replayed into it on
 * arrival. Nothing is lost — the reports just arrive a second late, which
 * matters to nobody, whereas the second of loading mattered to everyone.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Filled in once the SDK lands; every export below goes through it. */
type SentryModule = typeof import("@sentry/nextjs");
let sentry: SentryModule | null = null;

/**
 * What went wrong before the SDK arrived.
 *
 * Load-time errors are the ones worth having — a hydration crash on a cheap
 * Android is exactly the report you cannot reproduce yourself — and they are
 * also the ones a late-loading tracker would miss. Capped so a page erroring
 * in a loop cannot grow this without limit.
 */
const MAX_EARLY = 20;
const early: unknown[] = [];

function remember(error: unknown) {
  if (early.length < MAX_EARLY) early.push(error);
}

function onError(event: ErrorEvent) {
  remember(event.error ?? event.message);
}

function onRejection(event: PromiseRejectionEvent) {
  remember(event.reason);
}

/**
 * Wait for quiet before spending the network and the main thread.
 *
 * `requestIdleCallback` is the right tool and Safari still doesn't have it,
 * so the timeout is the fallback rather than an extra. Either way this runs
 * after first paint, which is the whole point.
 */
function whenIdle(run: () => void) {
  if (typeof window === "undefined") return;
  const ric = window.requestIdleCallback;
  if (typeof ric === "function") ric(run, { timeout: 4000 });
  else window.setTimeout(run, 2000);
}

if (dsn && typeof window !== "undefined") {
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  whenIdle(() => {
    import("@sentry/nextjs")
      .then((mod) => {
        mod.init({
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

        sentry = mod;

        // Hand over everything that happened while we were waiting, then stop
        // listening — from here the SDK's own handlers are the better ones.
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        for (const error of early.splice(0)) mod.captureException(error);
      })
      .catch(() => {
        // A blocked or failed SDK download is not a reason to break the shop.
        // The listeners stay on and the buffer stops at MAX_EARLY.
      });
  });
}

/**
 * Navigation timing. Exported whether or not Sentry is on; it no-ops.
 *
 * Next calls this synchronously on every client-side navigation, so it cannot
 * wait for the import. Before the SDK lands it does nothing, which costs the
 * first second or so of navigation spans — the trade this whole file is making.
 */
export const onRouterTransitionStart: NonNullable<
  SentryModule["captureRouterTransitionStart"]
> = (...args) => sentry?.captureRouterTransitionStart?.(...args);
