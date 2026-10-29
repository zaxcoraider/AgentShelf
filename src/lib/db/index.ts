import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database access.
 * - DATABASE_URL set (Render): real Postgres via postgres-js.
 * - DATABASE_URL empty (local dev, judges running it locally): PGlite, an embedded
 *   Postgres stored in `.data/pglite`. Same SQL, no install.
 */

export const PGLITE_DIR = ".data/pglite";

function connect() {
  const url = process.env.DATABASE_URL;
  if (url) {
    return drizzlePostgres(postgres(url, { max: 5 }), { schema });
  }
  mkdirSync(PGLITE_DIR, { recursive: true });
  // Both drivers expose the same query API; type everything as the postgres-js flavour.
  return drizzlePglite(new PGlite(PGLITE_DIR), { schema }) as unknown as ReturnType<
    typeof drizzlePostgres<typeof schema>
  >;
}

export type Db = ReturnType<typeof connect>;

// Reuse one connection across Next.js dev hot reloads.
const globalForDb = globalThis as unknown as { agentshelfDb?: Db };

export const db: Db = (globalForDb.agentshelfDb ??= connect());

export { schema };
