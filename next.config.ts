import type { NextConfig } from "next";

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

export default nextConfig;
