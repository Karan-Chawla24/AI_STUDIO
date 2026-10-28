import { sceneShape } from "./scene-shapes";
import { storyboardShape } from "./storyboard-shapes";
import { ideasShape } from "./ideas-shapes";
import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { MongoServerError, type Db, type Document } from "mongodb";
import { runMigration } from "../db/migrations";
import { migrateAuth, verifyAuthSchema } from "../auth/schema";
import { DatabaseError } from "../db/config";
import { deletionShape } from "./deletion-shapes";
import { planShape } from "./plan-shapes";

const text = (max = 200) => ({ bsonType: "string", minLength: 1, maxLength: max });
const nullableText = (max: number) => ({ bsonType: ["string", "null"], minLength: 1, maxLength: max });
const integer = (minimum = 1) => ({ bsonType: ["int", "long", "double"], minimum, maximum: Number.MAX_SAFE_INTEGER, multipleOf: 1 });
const nil = { bsonType: "null" }; const date = { bsonType: "date" }; const nullableDate = { bsonType: ["date", "null"] };
const uuid = { bsonType: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" };
const hash = { bsonType: "string", pattern: "^[0-9a-f]{64}$" };
const object = (properties: Document) => ({ bsonType: "object", additionalProperties: false, required: Object.keys(properties), properties });
const base = { _id: uuid, schemaVersion: { enum: [1] }, createdAt: date };
// F05 validators intentionally permit only implemented draft states. Later features require additive migrations.
export const projectSchemas: Record<string, Document> = {
  projects: { $jsonSchema: object({ ...base, ownerId: text(200), updatedAt: date, revision: integer(), resourceVersion: integer(),
    title: text(120), titleSort: text(240), originalIdea: text(5000), audience: nullableText(200), niche: nullableText(200), refinedIdea: nil,
    settings: object({ voiceKey: { enum: [null, "INDIAN_MALE", "INDIAN_FEMALE"] }, captionStyle: { enum: ["CLEAN"] }, musicAssetId: nil, targetDurationSeconds: { ...integer(60), maximum: 90 } }),
    nextStoryboardVersion: { enum: [1] }, activeStoryboardId: nil, currentSnapshotHash: nil, approval: nil, latestRenderId: nil, currentRenderId: nil, activeJobId: nil, socialCaptionDraft: nil,
    warnings: { bsonType: "array", maxItems: 0 }, lifecycle: { enum: ["ACTIVE", "DELETING", "DELETED"] }, deletedAt: nullableDate, deletionId: { bsonType: ["string", "null"] },
    publishFence: object({ epoch: integer(0), blocked: { bsonType: "bool" }, activeIntentId: nil, reason: nullableText(200) }),
    statusProjection: object({ creationStatus: { enum: ["DRAFT"] }, publicationStatus: { enum: ["NOT_PUBLISHED"] }, stale: { enum: [false] }, computedAt: date }),
  }) },
  idempotencyRecords: { $jsonSchema: object({ ...base, ownerId: text(200), method: { enum: ["POST"] }, routeKey: { enum: ["/api/v1/projects"] }, keyHash: hash, requestHash: hash,
    operationId: uuid, responseStatus: { enum: [201] }, responseBody: { bsonType: "object" }, state: { enum: ["TERMINAL"] }, terminalAt: date, expiresAt: date,
  }) },
  auditEvents: { $jsonSchema: object({ ...base, ownerId: text(200), actorType: { enum: ["USER"] }, actorId: text(200), action: { enum: ["PROJECT_CREATED"] }, aggregateType: { enum: ["PROJECT"] }, aggregateId: uuid,
    requestId: text(128), jobId: nil, details: object({ defaultsVersion: { enum: ["project-defaults-v1"] } }), expiresAt: date,
  }) },
};
type Index = { name: string; key: Record<string, 1 | -1>; unique?: boolean; expireAfterSeconds?: number; partialFilterExpression?: Document };
export const projectIndexes: Record<string, Index[]> = {
  projects: [{ name: "project_owner_created", key: { ownerId: 1, createdAt: -1, _id: -1 }, partialFilterExpression: { lifecycle: "ACTIVE" } }, { name: "project_admission_created", key: { ownerId: 1, createdAt: -1 } }],
  idempotencyRecords: [{ name: "idem_scope", key: { ownerId: 1, method: 1, routeKey: 1, keyHash: 1 }, unique: true }, { name: "idem_expiry", key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
  auditEvents: [{ name: "audit_aggregate", key: { aggregateType: 1, aggregateId: 1, createdAt: -1 } }, { name: "audit_expiry", key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
};
export const projectMigrationId = "F05_0001_projects";
const checksum = createHash("sha256").update(JSON.stringify({ projectSchemas, projectIndexes })).digest("hex");
async function verifyShape(db: Db) {
  for (const [name, validator] of Object.entries(projectSchemas)) {
    const info = await db.listCollections({ name }, { nameOnly: false }).next();
    if ((!isDeepStrictEqual(info?.options?.validator, validator) && !isDeepStrictEqual(info?.options?.validator, deletionShape(name, validator)) && !isDeepStrictEqual(info?.options?.validator, planShape(name, deletionShape(name, validator))) && !isDeepStrictEqual(info?.options?.validator, ideasShape(name, planShape(name, deletionShape(name, validator)))) && !isDeepStrictEqual(info?.options?.validator, storyboardShape(name, ideasShape(name, planShape(name, deletionShape(name, validator))))) && !isDeepStrictEqual(info?.options?.validator,sceneShape(name,storyboardShape(name, ideasShape(name, planShape(name, deletionShape(name, validator))))))) || info?.options?.validationLevel !== "strict" || info?.options?.validationAction !== "error") throw new DatabaseError("PROJECT_SCHEMA_DRIFT", "Project collection validation differs from the required schema.");
    const actual = await db.collection(name).listIndexes().toArray();
    for (const index of projectIndexes[name]) {
      const found = actual.find((i) => i.name === index.name);
      if (!found || !isDeepStrictEqual(found.key, index.key) || !!found.unique !== !!index.unique || found.expireAfterSeconds !== index.expireAfterSeconds || !isDeepStrictEqual(found.partialFilterExpression, index.partialFilterExpression) || found.sparse || found.hidden) throw new DatabaseError("PROJECT_INDEX_DRIFT", "Project indexes differ from the required schema.");
    }
  }
}
export async function verifyProjects(db: Db) {
  await verifyShape(db);
  const record = await db.collection<{ _id: string; state: string; checksum: string }>("schemaMigrations").findOne({ _id: projectMigrationId });
  if (record?.state !== "APPLIED" || record.checksum !== checksum) throw new DatabaseError("PROJECT_MIGRATION_REQUIRED", "Run projects:migrate before creating projects.");
}
export async function migrateProjects(db: Db) {
  await migrateAuth(db); await verifyAuthSchema(db);
  return runMigration(db, projectMigrationId, checksum, async () => {
    for (const [name, validator] of Object.entries(projectSchemas)) {
      try { await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" }); }
      catch (e) { if (!(e instanceof MongoServerError) || e.code !== 48) throw e; }
      for (const { key, ...options } of projectIndexes[name]) await db.collection(name).createIndex(key, options);
    }
    await verifyShape(db);
  }, () => verifyProjects(db));
}
