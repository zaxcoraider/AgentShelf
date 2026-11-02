import type { NextConfig } from "next";

/** Standard hardening for every response. No full CSP: the PayPal SDK and AG Studio load their own scripts. */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // PGlite loads its WASM/data files from node_modules at runtime; don't bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Product photos go through server actions; the client shrinks them to ~200 KB first.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // The MCP product-card widget inlines this browser bundle, read from disk at runtime.
  outputFileTracingIncludes: {
    "/api/mcp/[slug]": ["./node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js"],
    "/api/mcp": ["./node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js"],
    // Sample product photos that /start copies into a new shop.
    "/start": ["./scripts/seed-photos/samples/*.jpg"],
  },
};

export default nextConfig;
