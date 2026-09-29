import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/**
 * The landing page hard-codes a few marketing shots at this project's storage
 * bucket (see IMG_BASE in src/app/page.tsx), so the host has to be allowed even
 * when NEXT_PUBLIC_SUPABASE_URL isn't in the build environment. Deriving the
 * allow-list from the env var alone meant one missing variable turned every
 * photo on the homepage into a 400 from the image optimiser — a blank grid,
 * with nothing in the logs to say why.
 */
const STORAGE_HOSTS = new Set(["djxcwbxahmtoglinsaaz.supabase.co"]);
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  STORAGE_HOSTS.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname);
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [...STORAGE_HOSTS].map((hostname) => ({
      protocol: "https" as const,
      hostname,
      pathname: "/storage/v1/object/public/**",
    })),

    /* A YEAR, and it is safe for one specific reason.
    
       Next 16 re-transforms an image once its cache entry expires, and the
       default is four hours — so one menu photo can be re-processed six
       times a day for ever, whether or not anybody looked at it. On a plan
       that counts transformations, that is the meter running on a picture
       that has not changed since March.
    
       A long cache is normally dangerous: change the photo and customers
       keep seeing the old one. It is safe HERE because every upload in this
       codebase writes to a NEW path — `crypto.randomUUID()` for promo
       media, `meals/<id>-<timestamp>` for a dish photo, a timestamp for a
       receipt. A changed photo is a changed URL, so a cached transform can
       never be a stale one: there is nothing behind the old URL to go out
       of date. Reuse a path anywhere and this line stops being safe, which
       is why it is written down next to it. */
    minimumCacheTTL: 31_536_000,

    /* The widths this shop's layouts actually ask for.
    
       Next generates a variant per width in these lists, and each one is a
       billed transformation. The defaults carry eight device widths up to
       3840 — a 4K desktop — for a menu photograph on a phone in a palengke.
       Nothing here renders wider than 100vw, and the `sizes` hints across
       the app resolve to 45vw, 33vw, 25vw, 20vw and a handful of fixed
       pixel sizes.
    
       1200 is kept deliberately rather than trimmed to the round numbers: a
       390px phone at three times the pixel density asks for 1170, and
       without 1200 it would be handed 1920 — fewer transformations bought
       with a bigger download for the customers who are most of the traffic
       and least likely to be on wifi. 2048 and 3840 go, because no screen
       that size is looking at this menu. */
    deviceSizes: [640, 828, 1080, 1200, 1920],
    /* Covers every fixed-width image in the app — the largest is 176px,
       which at twice the density asks for 352 and is served the 384. */
    imageSizes: [64, 128, 256, 384],
  },
  experimental: {
    serverActions: {
      // Next.js caps Server Action request bodies at 1MB by default, which
      // silently rejected meal-photo uploads (our own limit is 8MB) before
      // the action code ever ran, surfacing as an opaque digest-only error.
      bodySizeLimit: "10mb",
    },
  },
};

/**
 * Sentry's wrapper is applied only when the shop has an account.
 *
 * It exists to upload source maps at build time, so a stack trace points at
 * the real line instead of at minified rubbish. That upload needs an auth
 * token; without one the wrapper would warn on every single build, and a
 * warning that is always there is a warning nobody reads — including the day
 * it changes. So with no DSN the config passes through untouched.
 *
 * `widenClientFileUpload` covers the chunks Next splits a page into, which is
 * where most of a React stack actually lives. Source maps are hidden from the
 * browser after upload: they are for reading errors, not for shipping the
 * shop's source to anyone who opens devtools.
 */
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      widenClientFileUpload: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      // Routes Sentry's own requests through the shop's domain, so an ad
      // blocker cannot silently swallow the reports — which would leave the
      // owner believing nothing is wrong.
      tunnelRoute: "/monitoring",
      // `disableLogger` used to live here and the build itself said it is
      // deprecated, replaced by a webpack tree-shake option that Turbopack —
      // which is what builds this project — does not support. Dropped rather
      // than swapped for something that would silently do nothing.
    })
  : nextConfig;
