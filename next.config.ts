import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in $HOME otherwise misleads
  // Turbopack's root inference.
  turbopack: {
    root: __dirname,
  },
  // Client-fetched map data. The land masks carry a version in the filename
  // (see scripts/build-client-masks.mjs) so they're truly immutable at their
  // URL — cache for a year; a return visitor never re-downloads a mask before
  // a selection clips. metros/regions keep unversioned names, so they get a
  // day + a week of stale-while-revalidate instead.
  async headers() {
    return [
      {
        source: "/data/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      // Later rules override same-key headers from earlier matches, so the
      // mask-specific rule must come after the generic /data rule.
      {
        source: "/data/land-mask-:file",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
