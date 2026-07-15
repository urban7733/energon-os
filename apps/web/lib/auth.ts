import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt, organization } from "better-auth/plugins";
import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://energon:energon@localhost:5432/energon";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/**
 * Server-side Better Auth instance.
 *
 * - Email/password auth with database sessions in the shared Energon Postgres.
 * - `organization` plugin: users create/manage orgs; the active organization id
 *   becomes the Energon org id used by the Rust API.
 * - `jwt` plugin: EdDSA (Ed25519) tokens; the Rust API verifies them against
 *   the JWKS endpoint at `${BETTER_AUTH_URL}/api/auth/jwks`.
 */
export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: new Pool({ connectionString: databaseUrl }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
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
