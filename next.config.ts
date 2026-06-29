import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in $HOME otherwise misleads
  // Turbopack's root inference.
  turbopack: {
    root: __dirname,
  },
  // The /api/geocode route reads the land mask off disk at runtime; make sure
  // the data files travel with the serverless bundle.
  outputFileTracingIncludes: {
    "/api/geocode": ["./data/land-mask.json", "./data/land-mask-coarse.json"],
  },
};

export default nextConfig;
