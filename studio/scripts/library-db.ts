import { loadEnvConfig } from "@next/env";
import { getDatabase, closeDatabase, assertTransactionSupport } from "../src/server/db/client";
import { DatabaseError } from "../src/server/db/config";
import { migrateLibrary, verifyLibrary } from "../src/server/projects/library-schema";
async function main() {
  const command = process.argv[2]; if (!["migrate", "verify"].includes(command)) throw new Error("Invalid command");
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: () => {} });
  const { db } = await getDatabase(); await assertTransactionSupport(db);
  if (command === "migrate") console.log(`Library migration: ${await migrateLibrary(db)}`);
  else { await verifyLibrary(db); console.log("Library indexes verified."); }
}
main().catch((error: unknown) => { console.error(error instanceof DatabaseError ? `${error.code}: ${error.message}` : "LIBRARY_MIGRATION_FAILED: Review permissions and migration state."); process.exitCode = 1; }).finally(async () => { await closeDatabase(); });
