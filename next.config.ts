import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in $HOME otherwise misleads
  // Turbopack's root inference.
  turbopack: {
    root: __dirname,
  },
  // The selection endpoint reads the coarse land mask off disk at runtime.
  outputFileTracingIncludes: {
    "/api/geocode": ["./data/land-mask-coarse.json"],
  },
  outputFileTracingExcludes: {
    "/api/geocode": ["./data/land-mask.json"],
  },
};

export default nextConfig;
