/**
 * Apply SQL migrations from ./drizzle to whichever database `src/lib/db` connects to.
 * Run: npm run db:migrate
 */
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { db } from "../src/lib/db";

const migrationsFolder = "./drizzle";

if (process.env.DATABASE_URL) {
  await migratePostgres(db, { migrationsFolder });
  console.log("Migrated Postgres (DATABASE_URL).");
} else {
  // `db` is the PGlite driver underneath (see src/lib/db/index.ts).
  await migratePglite(db as unknown as Parameters<typeof migratePglite>[0], { migrationsFolder });
  console.log("Migrated local PGlite database (.data/pglite).");
}
process.exit(0);
