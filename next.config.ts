import type { NextConfig } from "next";

import { buildContentSecurityPolicy } from "./src/lib/security/csp";

/**
 * Baseline security headers for every response. Life OS stores health,
 * financial and career data, so framing, MIME sniffing and referrer leakage
 * are locked down from day one, plus a Content-Security-Policy (ADR-029).
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      development: process.env.NODE_ENV === "development",
    }),
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Browsers must always fetch the latest service worker.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
    ];
  },
  async redirects() {
    // The root has no content of its own; the proxy sends signed-out users
    // from /dashboard on to /login.
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
};

export default nextConfig;
