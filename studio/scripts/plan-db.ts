import { loadEnvConfig } from "@next/env";
import { getDatabase, closeDatabase, assertTransactionSupport } from "../src/server/db/client";
import { DatabaseError } from "../src/server/db/config";
import { migratePlan, verifyPlan } from "../src/server/projects/plan-schema";
async function main() {
  const command = process.argv[2]; if (!["migrate", "verify"].includes(command)) throw new Error("Invalid command");
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: () => {} });
  const { db } = await getDatabase(); await assertTransactionSupport(db);
  if (command === "migrate") console.log(`Plan migration: ${await migratePlan(db)}`);
  else { await verifyPlan(db); console.log("Plan indexes verified."); }
}
main().catch((error: unknown) => { console.error(error instanceof DatabaseError ? `${error.code}: ${error.message}` : "PLAN_MIGRATION_FAILED: Review permissions and migration state."); process.exitCode = 1; }).finally(async () => { await closeDatabase(); });
