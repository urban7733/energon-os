import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt, organization } from "better-auth/plugins";
import { Pool } from "pg";
import { TRUSTED_IP_HEADERS } from "./client-ip";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://energon:energon@localhost:5432/energon";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

type SocialProviderConfig = {
  clientId: string;
  clientSecret: string;
};

function socialProvider(
  idVar: string,
  secretVar: string,
): SocialProviderConfig | undefined {
  const clientId = process.env[idVar]?.trim();
  const clientSecret = process.env[secretVar]?.trim();

  if (!clientId || !clientSecret) {
    return undefined;
  }

  return { clientId, clientSecret };
}

const githubProvider = socialProvider("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET");
const betterAuthInfraEnabled = Boolean(process.env.BETTER_AUTH_API_KEY?.trim());

/** Providers with configured credentials; drives the login page buttons. */
export const enabledSocialProviders = {
  github: githubProvider !== undefined,
} as const;

export type SocialProviderId = keyof typeof enabledSocialProviders;

/**
 * Server-side Better Auth instance.
 *
 * - Email/password auth with database sessions in the shared Energon Postgres.
 * - `organization` plugin: users create/manage orgs; the active organization id
 *   becomes the Energon org id used by the Rust API.
 * - `jwt` plugin: EdDSA (Ed25519) tokens; the Rust API verifies them against
 *   the JWKS endpoint at `${BETTER_AUTH_URL}/api/auth/jwks`.
 * - GitHub login is enabled only when its client id/secret environment
 *   variables are set.
 */
export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: new Pool({ connectionString: databaseUrl }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  socialProviders: {
    ...(githubProvider ? { github: githubProvider } : {}),
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"],
      // Never attach a GitHub login to a password account whose email was not
      // verified: otherwise someone could pre-register a victim's email and
      // later share the victim's linked account (pre-account takeover).
      requireLocalEmailVerified: true,
    },
  },
  // On in every environment (Better Auth only enables it in production by
  // default). Credential endpoints get much tighter budgets than reads.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/forget-password": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      "/change-password": { window: 300, max: 5 },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  advanced: {
    // Cloudflare-controlled client IP; see lib/client-ip.ts. Without a
    // resolvable IP, Better Auth would put every visitor into one shared
    // rate-limit bucket and lock out all sign-ins together.
    ipAddress: {
      ipAddressHeaders: TRUSTED_IP_HEADERS,
    },
  },
  plugins: [
    organization(),
    jwt({
      jwks: {
        keyPairConfig: {
          alg: "EdDSA",
          crv: "Ed25519",
        },
      },
      jwt: {
        issuer: process.env.ENERGON_JWT_ISSUER ?? baseURL,
        audience: process.env.ENERGON_JWT_AUDIENCE ?? "energon-api",
        expirationTime: "15m",
        definePayload: ({ user, session }) => ({
          email: user.email,
          org: session.activeOrganizationId ?? null,
        }),
      },
    }),
    ...(betterAuthInfraEnabled ? [dash()] : []),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
