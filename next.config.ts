import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in $HOME otherwise misleads
  // Turbopack's root inference.
  turbopack: {
    root: __dirname,
  },
  // Client-fetched map data (metros, regions, the coarse land mask) is static
  // and rarely changes — let the browser and CDN hold onto it so a return
  // visitor never re-downloads the land mask before a selection can clip.
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
    ];
  },
};

export default nextConfig;
