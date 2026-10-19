import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { API_CONTENT_SECURITY_POLICY } from "./lib/csp";

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(appRoot, "../..");

const devWatchIgnored = [
  "**/target/**",
  "**/crates/**",
  "**/migrations/**",
  "**/policies/**",
  "**/.git/**",
  "**/.tmp/**",
];

const isDev = process.env.NODE_ENV !== "production";

// Page CSPs carry a per-request nonce and are set in middleware.ts. These headers
// apply to every response, including API routes and static files.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Preserve the Workers-specific TCP implementation used by node-postgres.
  serverExternalPackages: ["pg", "pg-cloudflare"],
  // No static export: Better Auth API routes and server-side session checks
  // require a Node/Bun server runtime (`next start`).
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Session-bound pages must never be stored by shared caches.
      { source: "/dashboard/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY },
        ],
      },
    ];
  },
  images: {
    unoptimized: true,
    qualities: [75, 92],
  },
  turbopack: {
    // Bun hoists deps to the repo root, so Turbopack must resolve from there.
    root: workspaceRoot,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: devWatchIgnored,
      };
    }

    return config;
  },
};

export default nextConfig;
