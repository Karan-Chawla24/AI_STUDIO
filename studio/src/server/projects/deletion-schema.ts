import {settingsShape} from "./settings-shapes";
import {compileShape} from "./compile-shapes";
import { sceneShape } from "./scene-shapes";
import { storyboardShape } from "./storyboard-shapes";
import { ideasShape } from "./ideas-shapes";
import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Db } from "mongodb";
import { runMigration } from "../db/migrations";
import { DatabaseError } from "../db/config";
import { projectSchemas } from "./schema";
import { migrateLibrary, verifyLibrary } from "./library-schema";
import { deletionShape } from "./deletion-shapes";
import { planShape } from "./plan-shapes";
const id = "F07_0001_project_deletion";
const text = { bsonType: "string", minLength: 1, maxLength: 200 };
const uuid = { bsonType: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" };
const date = { bsonType: "date" }, nullableDate = { bsonType: ["date", "null"] };
const properties = { _id: uuid, schemaVersion: { enum: [1] }, ownerId: text, scope: { enum: ["PROJECT"] }, targetId: uuid, state: { enum: ["ACCEPTED", "COMPLETED", "REQUIRES_ATTENTION"] }, resourceVersion: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 }, createdAt: date, updatedAt: date, startedAt: nullableDate, completedAt: nullableDate, expiresAt: nullableDate, checkpoints: { bsonType: "object", required: ["draftPurged"], additionalProperties: false, properties: { draftPurged: { bsonType: "bool" } } }, blockedIntentIds: { bsonType: "array", maxItems: 0 }, error: { enum: [null, "UNSUPPORTED_DEPENDENCIES"] } };
const validator = { $jsonSchema: { bsonType: "object", additionalProperties: false, required: Object.keys(properties), properties } };
const indexes = [{ name: "deletion_target", key: { scope: 1, targetId: 1 }, unique: true }, { name: "deletion_backlog", key: { state: 1, updatedAt: 1 } }, { name: "deletion_expiry", key: { expiresAt: 1 }, expireAfterSeconds: 0 }] as const;
const extensions = Object.fromEntries(["idempotencyRecords", "auditEvents"].map(name => [name, deletionShape(name, projectSchemas[name])]));
const tombstoneIndex = { name: "project_deleted_expiry", key: { deletedAt: 1 } as const, expireAfterSeconds: 90 * 86400, partialFilterExpression: { lifecycle: "DELETED" } };
const checksum = createHash("sha256").update(JSON.stringify({ validator, indexes, extensions, tombstoneIndex })).digest("hex");
async function verifyShape(db: Db) {
  const tombstone = (await db.collection("projects").listIndexes().toArray()).find(i => i.name === tombstoneIndex.name);
  if (!tombstone || !isDeepStrictEqual(tombstone.key, tombstoneIndex.key) || !isDeepStrictEqual(tombstone.partialFilterExpression, tombstoneIndex.partialFilterExpression) || tombstone.expireAfterSeconds !== tombstoneIndex.expireAfterSeconds || tombstone.unique || tombstone.hidden || tombstone.sparse) throw new DatabaseError("DELETION_INDEX_DRIFT", "Tombstone retention index requires repair.");
  for (const [name, expected] of Object.entries({ ...extensions, deletionJobs: validator })) {
    const info = await db.listCollections({ name }, { nameOnly: false }).next();
    if ((!isDeepStrictEqual(info?.options?.validator, expected) && !isDeepStrictEqual(info?.options?.validator, planShape(name, expected)) && !isDeepStrictEqual(info?.options?.validator, ideasShape(name, planShape(name, expected))) && !isDeepStrictEqual(info?.options?.validator, storyboardShape(name, ideasShape(name, planShape(name, expected)))) && !isDeepStrictEqual(info?.options?.validator,sceneShape(name,storyboardShape(name, ideasShape(name, planShape(name, expected))))) && !isDeepStrictEqual(info?.options?.validator,compileShape(name,sceneShape(name,storyboardShape(name, ideasShape(name, planShape(name, expected)))))) && !isDeepStrictEqual(info?.options?.validator,settingsShape(name,compileShape(name,sceneShape(name,storyboardShape(name, ideasShape(name, planShape(name, expected)))))))) || info?.options?.validationLevel !== "strict" || info?.options?.validationAction !== "error") throw new DatabaseError("DELETION_SCHEMA_DRIFT", "Deletion schema requires migration or repair.");
  }
  const actual = await db.collection("deletionJobs").listIndexes().toArray();
  for (const expected of indexes) {
    const found = actual.find(i => i.name === expected.name);
    if (!found || !isDeepStrictEqual(found.key, expected.key) || !!found.unique !== ("unique" in expected) || found.expireAfterSeconds !== ("expireAfterSeconds" in expected ? 0 : undefined) || found.sparse || found.hidden || found.partialFilterExpression) throw new DatabaseError("DELETION_INDEX_DRIFT", "Deletion indexes require repair.");
  }
}
export async function verifyDeletion(db: Db) {
  await verifyLibrary(db); await verifyShape(db);
  const record = await db.collection<{ _id: string; state: string; checksum: string }>("schemaMigrations").findOne({ _id: id });
  if (record?.state !== "APPLIED" || record.checksum !== checksum) throw new DatabaseError("DELETION_MIGRATION_REQUIRED", "Run deletion:migrate before deleting projects.");
}
export async function migrateDeletion(db: Db) {
  await migrateLibrary(db);
  return runMigration(db, id, checksum, async () => {
    for (const [name, expected] of Object.entries(extensions)) await db.command({ collMod: name, validator: expected, validationLevel: "strict", validationAction: "error" });
    const existing = await db.listCollections({ name: "deletionJobs" }).next();
    if (!existing) await db.createCollection("deletionJobs", { validator, validationLevel: "strict", validationAction: "error" });
    for (const { key, ...options } of indexes) await db.collection("deletionJobs").createIndex(key, options);
    const { key, ...options } = tombstoneIndex; await db.collection("projects").createIndex(key, options);
    await verifyShape(db);
  }, () => verifyDeletion(db));
}
