import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDatabase, type DatabaseConnection } from "../src/server/db/client";
import { provisionProfile, type UserProfile } from "../src/server/auth/profile";
import { migratePlan, verifyPlan } from "../src/server/projects/plan-schema";
import { migrateDeletion } from "../src/server/projects/deletion-schema";
import { updatePlan, validatePlan } from "../src/server/projects/plan";
import { createProject, readProject } from "../src/server/projects/service";
import { deleteProject, cleanDeletion } from "../src/server/projects/deletion";
import { validateCreate, type Project } from "../src/server/projects/model";
import { csrfToken, projectRequest } from "../src/server/projects/http";
let server: MongoMemoryReplSet, connection: DatabaseConnection, profile: UserProfile;
const user = { id: "plan-owner", name: "Plan Tester", email: "plan@example.com", emailVerified: false, createdAt: new Date(), updatedAt: new Date() };
const config = { origin: "http://localhost:3001", secure: false, secret: "x".repeat(40) };
const create = () => createProject(connection, user.id, validateCreate({ title: "Original title", originalIdea: "Original source", audience: "Beginners" }), randomUUID(), randomUUID());
const save = (id: string, body: unknown, trace = randomUUID()) => updatePlan(connection, user.id, id, validatePlan(body), trace);
before(async () => {
 server = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1 } });
 connection = await connectDatabase({ uri: server.getUri(), database: "studio_plan_test", production: false });
 await migrateDeletion(connection.db);
 const previous = await connection.db.collection("schemaMigrations").find({ state: "APPLIED" }, { projection: { _id: 1, checksum: 1 } }).toArray();
 await migratePlan(connection.db);
 for (const row of previous) assert.equal((await connection.db.collection("schemaMigrations").findOne({ _id: row._id }))?.checksum, row.checksum);
 profile = (await provisionProfile(connection.db, user))!; await provisionProfile(connection.db, { ...user, id: "plan-other" });
}, { timeout: 240_000 });
after(async () => { await connection?.client.close(); await server?.stop(); });
test("plan migration is repeatable and preserves prior migration checksums", async () => { assert.equal(await migratePlan(connection.db), "already-applied"); await verifyPlan(connection.db); });
test("patch validation uses required revision, strict fields, NFC and nullable optionals", () => {
 assert.throws(() => validatePlan({ title: "x" }), { code: "PRECONDITION_REQUIRED" });
 for (const value of [{ expectedRevision: 1 }, { expectedRevision: 1, originalIdea: "new" }, { expectedRevision: 1.2, title: "x" }, { expectedRevision: 1, refinedIdea: null }, { expectedRevision: 1, title: " " }, { expectedRevision: 1, title: "x".repeat(121) }, { expectedRevision: 1, ownerId: "other" }, { expectedRevision: 1, audience: "" }]) assert.throws(() => validatePlan(value));
 assert.deepEqual(validatePlan({ expectedRevision: 1, title: " e\u0301 ", audience: null }), { expectedRevision: 1, title: "é", audience: null });
});
test("saved plan increments versions, updates title sort, preserves original and audits only field names", async () => {
 const { data } = await create(); const saved = await save(data.id, { expectedRevision: 1, title: "Renamed", refinedIdea: "Private refinement", audience: null });
 assert.equal(saved.revision, 2); assert.equal(saved.resourceVersion, 2); assert.equal(saved.originalIdea, "Original source"); assert.equal(saved.audience, null); assert.equal(saved.niche, null);
 const stored = await readProject(connection, user.id, data.id); assert.equal(stored.titleSort, "renamed"); assert.equal(stored.refinedIdea, "Private refinement");
 const audit = await connection.db.collection("auditEvents").findOne({ aggregateId: data.id, action: "PROJECT_PLAN_UPDATED" }); assert.deepEqual(audit?.details.changedFields, ["title", "refinedIdea", "audience"]); assert.ok(!JSON.stringify(audit).includes("Private refinement"));
 assert.equal((await save(data.id, { expectedRevision: 2, title: "Renamed" })).revision, 2);
});
test("concurrent tabs cannot overwrite each other and conflict returns current revision", async () => {
 const { data } = await create(); const results = await Promise.allSettled([save(data.id, { expectedRevision: 1, title: "Tab one" }), save(data.id, { expectedRevision: 1, title: "Tab two" })]);
 assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
 const failure = results.find(r => r.status === "rejected") as PromiseRejectedResult; assert.equal(failure.reason.code, "REVISION_CONFLICT"); assert.equal(failure.reason.details.currentRevision, 2);
 assert.equal((await readProject(connection, user.id, data.id)).revision, 2);
});
test("foreign and inactive owners cannot edit", async () => {
 const { data } = await create(); await assert.rejects(updatePlan(connection, "plan-other", data.id, { expectedRevision: 1, title: "stolen" }, randomUUID()), { code: "RESOURCE_NOT_FOUND" });
 await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: user.id }, { $set: { lifecycle: "DELETING" } });
 try { await assert.rejects(save(data.id, { expectedRevision: 1, title: "blocked" }), { code: "ACCOUNT_DELETING" }); } finally { await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: user.id }, { $set: { lifecycle: "ACTIVE" } }); }
});
test("audit insert failure rolls back the edit and versions", async () => {
 const { data } = await create(); const trace = (await connection.db.collection("auditEvents").findOne({ aggregateId: data.id }))!.requestId;
 await connection.db.collection("auditEvents").createIndex({ requestId: 1 }, { name: "test_trace", unique: true });
 try { await assert.rejects(save(data.id, { expectedRevision: 1, title: "rollback" }, trace)); } finally { await connection.db.collection("auditEvents").dropIndex("test_trace"); }
 const stored = await readProject(connection, user.id, data.id); assert.equal(stored.title, "Original title"); assert.equal(stored.revision, 1);
});
test("deletion races are fenced and cleanup scrubs refined plan content", async () => {
 const { data } = await create();
 const results = await Promise.allSettled([save(data.id, { expectedRevision: 1, refinedIdea: "Private edited plan" }), deleteProject(connection, user.id, data.id, { expectedRevision: 1, confirmation: "DELETE_PROJECT" }, randomUUID(), randomUUID())]);
 assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
 const stored = await connection.db.collection<Project>("projects").findOne({ _id: data.id });
 let deletionId = stored!.deletionId;
 if (stored!.lifecycle === "ACTIVE") deletionId = (await deleteProject(connection, user.id, data.id, { expectedRevision: stored!.revision, confirmation: "DELETE_PROJECT" }, randomUUID(), randomUUID())).data.deletionId;
 await cleanDeletion(connection, deletionId!); const deleted = await connection.db.collection<Project>("projects").findOne({ _id: data.id }); assert.equal(deleted?.refinedIdea, null);
 await assert.rejects(save(data.id, { expectedRevision: 1, title: "resurrect" }), { code: "RESOURCE_NOT_FOUND" });
});
test("PATCH HTTP requires CSRF/session, rejects malformed input, changes ETag and needs no idempotency key", async () => {
 const { data } = await create(); const identity = { user, profile, sessionId: "plan-session" };
 async function send(body: unknown, extra: Record<string, string> = {}, auth = true) { return projectRequest(new Request(`${config.origin}/api/v1/projects/${data.id}`, { method: "PATCH", headers: { Origin: config.origin, "Content-Type": "application/json", "X-CSRF-Token": csrfToken(identity, config.secret), ...extra }, body: JSON.stringify(body) }), { connection, config, identity: auth ? identity : null }, data.id); }
 assert.equal((await send({ expectedRevision: 1, title: "new" }, {}, false)).status, 401); assert.equal((await send({ expectedRevision: 1, title: "new" }, { "X-CSRF-Token": "bad" })).status, 403);
 assert.equal((await send({ title: "new" })).status, 428); assert.equal((await send({ expectedRevision: 1, originalIdea: "changed" })).status, 422);
 assert.equal((await send({ expectedRevision: 1, title: "new" })).status, 200);
 const conflict = await send({ expectedRevision: 1, title: "newer" }); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error.details.currentRevision, 2);
 const get = await projectRequest(new Request(`${config.origin}/api/v1/projects/${data.id}`, { headers: { "If-None-Match": `"project-${data.id}-1"` } }), { connection, config, identity }, data.id); assert.equal(get.status, 200); assert.match(get.headers.get("etag")!, /-2"$/);
});
