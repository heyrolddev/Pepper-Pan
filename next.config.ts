import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
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
