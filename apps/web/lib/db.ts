import { Pool } from "pg";

/**
 * Shared read pool for server components. Better Auth keeps its own pool for
 * writes; this one is only used by server-rendered analytics to read
 * org-scoped aggregates directly from the same Postgres database.
 *
 * The pool is cached on `globalThis` so Next.js hot-reloads in development do
 * not open a new pool on every module evaluation.
 */
const connectionString =
  process.env.DATABASE_URL ?? "postgres://energon:energon@localhost:5432/energon";

const globalForPool = globalThis as typeof globalThis & {
  __energonReadPool?: Pool;
};

export const readPool: Pool =
  globalForPool.__energonReadPool ??
  new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.__energonReadPool = readPool;
}
