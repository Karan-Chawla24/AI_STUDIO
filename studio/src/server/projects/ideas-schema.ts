import { storyboardShape } from "./storyboard-shapes";
import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Db, Document } from "mongodb";
import { runMigration } from "../db/migrations";
import { DatabaseError } from "../db/config";
import { projectSchemas } from "./schema";
import { deletionShape } from "./deletion-shapes";
import { planShape } from "./plan-shapes";
import { ideasShape } from "./ideas-shapes";
import { migratePlan, verifyPlan } from "./plan-schema";
const text = (max = 200) => ({ bsonType: "string", minLength: 1, maxLength: max });
const ntext = (max = 200) => ({ ...text(max), bsonType: ["string", "null"] });
const int = (min = 1) => ({ bsonType: ["int", "long", "double"], minimum: min, maximum: Number.MAX_SAFE_INTEGER, multipleOf: 1 });
const date = { bsonType: "date" }, nd = { bsonType: ["date", "null"] }, nil = { bsonType: "null" }, bool = { bsonType: "bool" };
const obj = (p: Document) => ({ bsonType: "object", required: Object.keys(p), additionalProperties: false, properties: p });
const base = { _id: text(), schemaVersion: { enum: [1] }, ownerId: text(), projectId: text(), createdAt: date, updatedAt: date };
const error = { oneOf: [nil, obj({ code: text(), message: text(500) })] };
const input = obj({ title: text(120), idea: text(5000), audience: ntext(), niche: ntext(), duration: { ...int(60), maximum: 90 }, count: { ...int(), maximum: 10 }, guidance: { bsonType: "string", maxLength: 1000 }, model: text() });
export const schemas: Record<string, Document> = {
 generationJobs: { $jsonSchema: obj({ ...base, resourceVersion: int(), kind: { enum: ["IDEA_BRAINSTORM", "IDEA_REFINE"] }, state: { enum: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED", "REQUIRES_ATTENTION"] }, active: bool, stage: { enum: ["QUEUED", "PLANNING", "FINISHED"] }, baseRevision: int(), input: { oneOf: [nil,input] }, inputHash: text(64), proposalIds: { bsonType: "array", maxItems: 1, items: text() }, cancelRequested: bool, lease: obj({ holder: ntext(), epoch: int(0), expiresAt: nd }), startedAt: nd, finishedAt: nd, error, unsafeToRetry: bool }) },
 proposals: { $jsonSchema: obj({ ...base, version: int(), kind: { enum: ["IDEAS"] }, baseRevision: int(), targetSceneId: nil, state: { enum: ["PENDING", "APPLIED", "DISMISSED", "CONFLICTED"] }, payload: obj({ ideas: { bsonType: "array", minItems: 1, maxItems: 10, items: obj({ id: text(), title: text(120), refinedIdea: text(5000), rationale: text(500) }) } }), payloadHash: text(64), sourceJobId: text(), appliedStoryboardId: nil, appliedAt: nd }) },
 providerCalls: { $jsonSchema: obj({ ...base, jobId: text(), state: { enum: ["SENT", "SUCCEEDED", "FAILED", "OUTCOME_UNKNOWN"] }, requestHash: text(64), modelVersion: text(), sentAt: date, finishedAt: nd }) },
};
const indexes: Record<string, { name: string; key: Record<string, 1|-1>; unique?: boolean; partialFilterExpression?: Document }[]> = {
 generationJobs: [{ name: "idea_project_active", key: { projectId: 1 }, unique: true, partialFilterExpression: { active: true } }, { name: "idea_queue", key: { state: 1, createdAt: 1 } }, { name: "idea_quota", key: { ownerId: 1, createdAt: -1 } }, { name: "idea_job_history", key: { ownerId: 1, projectId: 1, createdAt: -1, _id: -1 } }],
 proposals: [{ name: "idea_source", key: { sourceJobId: 1 }, unique: true }, { name: "idea_proposal_history", key: { ownerId: 1, projectId: 1, createdAt: -1, _id: -1 } }],
 providerCalls: [{ name: "idea_provider_once", key: { jobId: 1 }, unique: true }],
};
export const extensions = Object.fromEntries(["projects", "idempotencyRecords"].map(n => [n, ideasShape(n, planShape(n, deletionShape(n,projectSchemas[n])))]));
const id = "F09_0001_idea_proposals", checksum = createHash("sha256").update(JSON.stringify({schemas,indexes,extensions})).digest("hex");
async function shape(db: Db) {
 for (const [name, validator] of Object.entries({...schemas,...extensions})) {
  const info = await db.listCollections({name}, {nameOnly:false}).next();
  if ((!isDeepStrictEqual(info?.options?.validator,validator) && !isDeepStrictEqual(info?.options?.validator,storyboardShape(name,validator))) || info?.options?.validationLevel !== "strict" || info?.options?.validationAction !== "error") throw new DatabaseError("IDEAS_SCHEMA_DRIFT", "Run ideas:migrate and verify the idea schema.");
  if (!indexes[name]) continue;
  const actual = await db.collection(name).listIndexes().toArray();
  for (const expected of indexes[name]) { const found = actual.find(i => i.name === expected.name); if (!found || !isDeepStrictEqual(found.key,expected.key) || !!found.unique !== !!expected.unique || !isDeepStrictEqual(found.partialFilterExpression,expected.partialFilterExpression) || found.sparse || found.hidden) throw new DatabaseError("IDEAS_INDEX_DRIFT", "Idea indexes require repair."); }
 }
}
export async function verifyIdeas(db: Db) { await verifyPlan(db); await shape(db); const record = await db.collection<{_id:string;state:string;checksum:string}>("schemaMigrations").findOne({_id:id}); if (record?.state !== "APPLIED" || record.checksum !== checksum) throw new DatabaseError("IDEAS_MIGRATION_REQUIRED", "Run ideas:migrate."); }
export async function migrateIdeas(db: Db) { await migratePlan(db); return runMigration(db,id,checksum,async () => { for (const [name,validator] of Object.entries(schemas)) { if (!await db.listCollections({name}).next()) await db.createCollection(name,{validator,validationLevel:"strict",validationAction:"error"}); for (const {key,...options} of indexes[name]) await db.collection(name).createIndex(key,options); } for (const [name,validator] of Object.entries(extensions)) await db.command({collMod:name,validator,validationLevel:"strict",validationAction:"error"}); await shape(db); },()=>verifyIdeas(db)); }
