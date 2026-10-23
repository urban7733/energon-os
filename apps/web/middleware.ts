import { NextResponse, type NextRequest } from "next/server";
import { sanitizeClientIpHeaders } from "./lib/client-ip";
import { contentSecurityPolicy, createNonce } from "./lib/csp";

/**
 * Kept as Edge `middleware` rather than Next 16's Node-only `proxy`: the
 * Cloudflare (OpenNext) build does not support Node.js middleware yet.
 *
 * Issues a fresh CSP nonce for every page request. Next.js reads the nonce
 * from the request's Content-Security-Policy header and stamps it on its
 * framework and page scripts; the layout reads `x-nonce` for its own tags.
 *
 * Auth routes only get their client IP headers sanitized (see
 * lib/client-ip.ts); their CSP comes from next.config.ts.
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  sanitizeClientIpHeaders(requestHeaders, process.env.ENERGON_PROXY_SECRET);

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const nonce = createNonce();
  const policy = contentSecurityPolicy(nonce);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    // Better Auth rate limits by client IP; strip untrusted IP headers first.
    "/api/auth/:path*",
    {
      // Pages only: skip API routes, build assets, and files with an extension
      // (images, video, robots.txt, llms.txt, .well-known documents).
      source: "/((?!api|_next/static|_next/image|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
