import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its WASM/data files from node_modules at runtime; don't bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Product photos go through server actions; the client shrinks them to ~200 KB first.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // The MCP product-card widget inlines this browser bundle, read from disk at runtime.
  outputFileTracingIncludes: {
    "/api/mcp/[slug]": ["./node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js"],
  },
};

export default nextConfig;
