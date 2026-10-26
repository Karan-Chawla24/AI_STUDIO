import { storyboardShape } from "./storyboard-shapes";
import { ideasShape } from "./ideas-shapes";
import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Db } from "mongodb";
import { runMigration } from "../db/migrations";
import { DatabaseError } from "../db/config";
import { projectSchemas } from "./schema";
import { deletionShape } from "./deletion-shapes";
import { planShape } from "./plan-shapes";
import { migrateDeletion, verifyDeletion } from "./deletion-schema";
const id = "F08_0001_plan_editor";
const extensions = Object.fromEntries(["projects", "auditEvents"].map(name => [name, planShape(name, deletionShape(name, projectSchemas[name]))]));
const checksum = createHash("sha256").update(JSON.stringify(extensions)).digest("hex");
async function verifyShape(db: Db) {
  for (const [name, validator] of Object.entries(extensions)) {
    const info = await db.listCollections({ name }, { nameOnly: false }).next();
    if ((!isDeepStrictEqual(info?.options?.validator, validator) && !isDeepStrictEqual(info?.options?.validator, ideasShape(name, validator)) && !isDeepStrictEqual(info?.options?.validator, storyboardShape(name, ideasShape(name, validator)))) || info?.options?.validationLevel !== "strict" || info?.options?.validationAction !== "error") throw new DatabaseError("PLAN_SCHEMA_DRIFT", "Plan schema requires migration or repair.");
  }
}
export async function verifyPlan(db: Db) {
  await verifyDeletion(db); await verifyShape(db);
  const record = await db.collection<{ _id: string; state: string; checksum: string }>("schemaMigrations").findOne({ _id: id });
  if (record?.state !== "APPLIED" || record.checksum !== checksum) throw new DatabaseError("PLAN_MIGRATION_REQUIRED", "Run plan:migrate before editing drafts.");
}
export async function migratePlan(db: Db) {
  await migrateDeletion(db);
  return runMigration(db, id, checksum, async () => {
    for (const [name, validator] of Object.entries(extensions)) await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    await verifyShape(db);
  }, () => verifyPlan(db));
}
