import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its WASM/data files from node_modules at runtime; don't bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Product photos go through server actions; the client shrinks them to ~200 KB first.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
