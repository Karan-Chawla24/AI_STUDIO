import { loadEnvConfig } from "@next/env";
import { assertTransactionSupport, closeDatabase, getDatabase } from "../src/server/db/client";
import { DatabaseError } from "../src/server/db/config";
import { migrateDatabase, migrationStatus, verifyDatabase } from "../src/server/db/migrations";

async function main() {
  const command = process.argv[2];
  if (!command || !["check", "status", "migrate", "verify"].includes(command)) {
    throw new DatabaseError("DB_COMMAND_INVALID", "Use check, status, migrate or verify.");
  }
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: () => {} });
  const { db } = await getDatabase();
  await assertTransactionSupport(db);
  if (command === "migrate") console.log(`Migration: ${await migrateDatabase(db)}`);
  else if (command === "verify") { await verifyDatabase(db); console.log("Database schema and indexes verified."); }
  else if (command === "status") console.log(JSON.stringify(await migrationStatus(db), null, 2));
  else console.log("Database connection and transaction-capable topology verified.");
}

main().catch((error: unknown) => {
  console.error(error instanceof DatabaseError ? `${error.code}: ${error.message}` : "DB_OPERATION_FAILED: Database operation failed. Inspect database permissions and migration state; no credentials were logged.");
  process.exitCode = 1;
}).finally(async () => { await closeDatabase().catch(() => { process.exitCode = 1; }); });
