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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  poweredByHeader: false,
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
