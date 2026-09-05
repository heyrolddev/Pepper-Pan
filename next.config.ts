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
