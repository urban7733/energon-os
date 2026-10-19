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

/** 128 random bits per response, base64-encoded for the CSP `nonce-` source. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Page CSP. Scripts run only when they carry this response's nonce (Next.js
 * adds it to its own scripts) or are loaded by such a script
 * (`'strict-dynamic'`), so an injected inline script or `<script src>` never
 * executes. Styles keep `'unsafe-inline'` because React `style` attributes
 * cannot carry a nonce; style injection cannot run code.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
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
}

/** Non-page responses (auth JSON, text routes) never render active content. */
export const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'";
