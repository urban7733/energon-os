/**
 * Client IP trust on Cloudflare.
 *
 * Cloudflare's edge sets `cf-connecting-ip` on every incoming request and
 * overwrites any value a client sends, so it is trustworthy when the app is
 * reached directly. The Pages front door (`pages-proxy/_worker.js`) adds a
 * second hop, where the original visitor IP is not guaranteed to survive. The
 * proxy therefore forwards it in `x-energon-client-ip` together with a shared
 * secret; any request without that secret has the header removed, so it cannot
 * be used to spoof addresses and dodge per-IP rate limits.
 */
export const CLIENT_IP_HEADER = "x-energon-client-ip";
export const PROXY_SECRET_HEADER = "x-energon-proxy-secret";

/** Header order Better Auth uses to resolve the client IP. */
export const TRUSTED_IP_HEADERS = [CLIENT_IP_HEADER, "cf-connecting-ip"];

export function sanitizeClientIpHeaders(headers: Headers, proxySecret: string | undefined): void {
  const presented = headers.get(PROXY_SECRET_HEADER);
  headers.delete(PROXY_SECRET_HEADER);

  const trusted = Boolean(proxySecret) && presented !== null && constantTimeEqual(presented, proxySecret!);
  if (!trusted) {
    headers.delete(CLIENT_IP_HEADER);
  }
}

/** Length-independent comparison without early exit (no Node crypto on the edge). */
function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
