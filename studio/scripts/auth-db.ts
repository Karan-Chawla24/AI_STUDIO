import { loadEnvConfig } from "@next/env";
import { writeFile } from "node:fs/promises";
import { assertTransactionSupport, closeDatabase, getDatabase } from "../src/server/db/client";
import { DatabaseError } from "../src/server/db/config";
import { authSchema, migrateAuth, verifyAuthSchema } from "../src/server/auth/schema";

async function main() {
  const command = process.argv[2];
  if (command === "schema") {
    await writeFile("../docs/implementation/F03_Auth_Adapter_Schema.json", JSON.stringify({ betterAuthVersion: "1.7.12", mongoAdapterVersion: "1.7.12", idStorage: "ObjectId; API/user profile identifiers are canonical strings", schema: authSchema }, null, 2) + "\n");
    console.log("Pinned adapter schema exported."); return;
  }
  if (!["migrate", "verify"].includes(command)) throw new DatabaseError("AUTH_COMMAND_INVALID", "Use migrate, verify or schema.");
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: () => {} });
  const { db } = await getDatabase(); await assertTransactionSupport(db);
  if (command === "migrate") console.log(`Authentication migration: ${await migrateAuth(db)}`);
  else { await verifyAuthSchema(db); console.log("Authentication schema and indexes verified."); }
}
main().catch((error: unknown) => { console.error(error instanceof DatabaseError ? `${error.code}: ${error.message}` : "AUTH_MIGRATION_FAILED: Check database permissions and migration state. No credentials were logged."); process.exitCode = 1; }).finally(async () => { await closeDatabase().catch(() => { process.exitCode = 1; }); });
