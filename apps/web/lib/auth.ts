import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt, organization } from "better-auth/plugins";
import { Pool } from "pg";

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
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
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
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
