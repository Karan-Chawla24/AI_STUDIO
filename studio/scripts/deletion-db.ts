import { loadEnvConfig } from "@next/env";
import { getDatabase, closeDatabase, assertTransactionSupport } from "../src/server/db/client";
import { DatabaseError } from "../src/server/db/config";
import { migrateDeletion, verifyDeletion } from "../src/server/projects/deletion-schema";
import { drainDeletions } from "../src/server/projects/deletion";
async function main() {
  const command = process.argv[2]; if (!["migrate", "verify", "drain", "worker"].includes(command)) throw new Error("Invalid command");
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: () => {} });
  const connection = await getDatabase(); await assertTransactionSupport(connection.db);
  if (command === "migrate") console.log(`Deletion migration: ${await migrateDeletion(connection.db)}`);
  else if (command === "verify") { await verifyDeletion(connection.db); console.log("Deletion schema and indexes verified."); }
  else if (command === "drain") console.log(`Deletion jobs processed: ${await drainDeletions(connection)}`);
  else {
    await verifyDeletion(connection.db); console.log("Draft cleanup worker ready.");
    let stopped = false; process.on("SIGINT", () => { stopped = true; }); process.on("SIGTERM", () => { stopped = true; });
    while (!stopped) { try { await drainDeletions(connection); } catch { console.error("PROJECT_CLEANUP_RETRY_REQUIRED"); } await new Promise(resolve => setTimeout(resolve, 5000)); }
  }
}
main().catch((error: unknown) => { console.error(error instanceof DatabaseError ? `${error.code}: ${error.message}` : "DELETION_COMMAND_FAILED: Review database and migration state."); process.exitCode = 1; }).finally(async () => { await closeDatabase(); });
