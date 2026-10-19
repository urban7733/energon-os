import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, createNonce } from "./lib/csp";

/**
 * Kept as Edge `middleware` rather than Next 16's Node-only `proxy`: the
 * Cloudflare (OpenNext) build does not support Node.js middleware yet.
 *
 * Issues a fresh CSP nonce for every page request. Next.js reads the nonce
 * from the request's Content-Security-Policy header and stamps it on its
 * framework and page scripts; the layout reads `x-nonce` for its own tags.
 */
export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const policy = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
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
