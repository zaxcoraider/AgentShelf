import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its WASM/data files from node_modules at runtime; don't bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
