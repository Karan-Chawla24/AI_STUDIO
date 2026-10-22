import { loadEnvConfig } from "@next/env";
import { assertTransactionSupport, getDatabase, closeDatabase } from "../src/server/db/client";
import { DatabaseError } from "../src/server/db/config";
import { migrateProjects, verifyProjects } from "../src/server/projects/schema";
async function main() {
  const command = process.argv[2]; if (!["migrate", "verify"].includes(command)) throw new Error("Invalid command");
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: () => {} });
  const { db } = await getDatabase(); await assertTransactionSupport(db);
  if (command === "migrate") console.log(`Projects migration: ${await migrateProjects(db)}`);
  else { await verifyProjects(db); console.log("Project schema and indexes verified."); }
}
main().catch((error: unknown) => { console.error(error instanceof DatabaseError ? `${error.code}: ${error.message}` : "PROJECT_MIGRATION_FAILED: Review permissions and migration state."); process.exitCode = 1; }).finally(async () => { await closeDatabase(); });
