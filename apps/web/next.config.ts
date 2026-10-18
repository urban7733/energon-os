import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

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

function origin(value: string | undefined): string | undefined {
  try {
    return value ? new URL(value).origin : undefined;
  } catch {
    return undefined;
  }
}

// The browser may only talk to this site, the configured Energon API, the
// public Base RPCs used by checkout, and Cloudflare Web Analytics. Even if an
// injected script ran, it could not ship operator tokens anywhere else.
const connectSources = [
  "'self'",
  origin(process.env.NEXT_PUBLIC_ENERGON_API_BASE_URL) ?? "http://127.0.0.1:3001",
  "https://mainnet.base.org",
  "https://sepolia.base.org",
  "https://cloudflareinsights.com",
  ...(isDev ? ["http://localhost:3001", "http://127.0.0.1:3001", "ws:", "wss:"] : []),
];

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js streams inline bootstrap scripts; dev tooling also needs eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  `connect-src ${[...new Set(connectSources)].join(" ")}`,
  // The landing page embeds the same-origin dashboard demo.
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
      { source: "/api/auth/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
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
