"use client";

import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Browser Better Auth client. Talks to the Next.js auth routes on the same
 * origin (`/api/auth/*`), so no base URL configuration is needed.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});

/**
 * Fetch a short-lived EdDSA JWT for the current session. The Rust API verifies
 * this token against the Better Auth JWKS endpoint.
 */
export async function fetchApiToken(): Promise<string> {
  const response = await fetch("/api/auth/token", { credentials: "include" });

  if (!response.ok) {
    throw new Error("Not signed in: unable to mint an API token.");
  }

  const body: unknown = await response.json();

  if (
    typeof body === "object" &&
    body !== null &&
    "token" in body &&
    typeof (body as { token: unknown }).token === "string"
  ) {
    return (body as { token: string }).token;
  }

  throw new Error("Auth token endpoint returned an unexpected response.");
}
