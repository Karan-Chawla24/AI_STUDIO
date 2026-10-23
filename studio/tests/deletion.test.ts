import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDatabase, type DatabaseConnection } from "../src/server/db/client";
import { provisionProfile, type UserProfile } from "../src/server/auth/profile";
import { migrateDeletion, verifyDeletion } from "../src/server/projects/deletion-schema";
import { cleanDeletion, deleteProject, drainDeletions, readDeletion, validateDelete } from "../src/server/projects/deletion";
import { createProject, readProject } from "../src/server/projects/service";
import { validateCreate, type Project } from "../src/server/projects/model";
import { csrfToken, projectRequest } from "../src/server/projects/http";
import { listProjects, dashboard, parseLibraryQuery } from "../src/server/projects/library";
let server: MongoMemoryReplSet, connection: DatabaseConnection, profile: UserProfile;
const owner = "delete-owner", other = "delete-other";
const user = { id: owner, name: "Deletion tester", email: "deletion@example.com", emailVerified: false, createdAt: new Date(), updatedAt: new Date() };
const config = { origin: "http://localhost:3001", secure: false, secret: "x".repeat(40) };
const input = validateCreate({ title: "Private title", originalIdea: "Private idea", audience: "Private audience", niche: "Private niche" });
const command = { expectedRevision: 1, confirmation: "DELETE_PROJECT" as const };
const create = (key = randomUUID(), requestId = randomUUID()) => createProject(connection, owner, input, key, requestId);
const remove = (id: string, key = randomUUID(), requestId = randomUUID()) => deleteProject(connection, owner, id, command, key, requestId);
before(async () => {
 server = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1 } });
 connection = await connectDatabase({ uri: server.getUri(), database: "studio_deletion_test", production: false });
 await migrateDeletion(connection.db); profile = (await provisionProfile(connection.db, user))!; await provisionProfile(connection.db, { ...user, id: other });
}, { timeout: 240_000 });
after(async () => { await connection?.client.close(); await server?.stop(); });
test("forward migration is repeatable and retains F05/F06 compatibility", async () => {
 assert.equal(await migrateDeletion(connection.db), "already-applied"); await verifyDeletion(connection.db);
 await create();
});
test("deletion validates confirmation, revision and rejects extra fields", () => {
 for (const bad of [null, {}, { ...command, expectedRevision: 0 }, { ...command, expectedRevision: 1.2 }, { ...command, confirmation: "DELETE" }, { ...command, ownerId: other }]) assert.throws(() => validateDelete(bad));
 assert.deepEqual(validateDelete(command), command);
});
test("atomic acceptance fences reads/list/counts and rejects stale/foreign deletion", async () => {
 const saved = await create(); const id = saved.data.id;
 await assert.rejects(deleteProject(connection, other, id, command, randomUUID(), randomUUID()), { code: "RESOURCE_NOT_FOUND" });
 await assert.rejects(deleteProject(connection, owner, id, { ...command, expectedRevision: 2 }, randomUUID(), randomUUID()), { code: "REVISION_CONFLICT" });
 const beforeCount = (await dashboard(connection, owner, { current: config.secret })).counts.projectsTotal;
 const accepted = await remove(id);
 assert.equal(accepted.data.state, "ACCEPTED"); await assert.rejects(readProject(connection, owner, id), { code: "RESOURCE_NOT_FOUND" });
 const stored = await connection.db.collection<Project>("projects").findOne({ _id: id }); assert.equal(stored?.lifecycle, "DELETING"); assert.equal(stored?.publishFence.blocked, true);
 assert.equal((await dashboard(connection, owner, { current: config.secret })).counts.projectsTotal, beforeCount - 1);
 assert.ok(!(await listProjects(connection, owner, parseLibraryQuery(new URLSearchParams()), { current: config.secret })).items.some(p => p.id === id));
 await assert.rejects(readDeletion(connection, other, accepted.data.deletionId), { code: "RESOURCE_NOT_FOUND" });
});
test("concurrent same-key requests replay one job; mismatched payload conflicts", async () => {
 const saved = await create(), key = randomUUID();
 const results = await Promise.all([remove(saved.data.id, key), remove(saved.data.id, key)]);
 assert.equal(results[0].data.deletionId, results[1].data.deletionId);
 assert.equal(await connection.db.collection("deletionJobs").countDocuments({ targetId: saved.data.id }), 1);
 await assert.rejects(deleteProject(connection, owner, saved.data.id, { ...command, expectedRevision: 2 }, key, randomUUID()), { code: "IDEMPOTENCY_CONFLICT" });
 await assert.rejects(remove(saved.data.id), { code: "RESOURCE_NOT_FOUND" });
});
test("audit failure rolls back the fence, job and receipt", async () => {
 const trace = randomUUID(), saved = await create(randomUUID(), trace);
 await connection.db.collection("auditEvents").createIndex({ requestId: 1 }, { unique: true, name: "test_audit_unique" });
 try { await assert.rejects(remove(saved.data.id, randomUUID(), trace)); } finally { await connection.db.collection("auditEvents").dropIndex("test_audit_unique"); }
 assert.equal((await readProject(connection, owner, saved.data.id)).lifecycle, "ACTIVE");
 assert.equal(await connection.db.collection("deletionJobs").countDocuments({ targetId: saved.data.id }), 0);
 assert.equal(await connection.db.collection("idempotencyRecords").countDocuments({ method: "DELETE", routeKey: `/api/v1/projects/${saved.data.id}` }), 0);
});
test("cleanup is recoverable, concurrent-safe and redacts content without allowing create replay", async () => {
 const createKey = randomUUID(), deleteKey = randomUUID(), saved = await create(createKey), accepted = await remove(saved.data.id, deleteKey);
 await Promise.all([cleanDeletion(connection, accepted.data.deletionId), cleanDeletion(connection, accepted.data.deletionId)]);
 const job = await readDeletion(connection, owner, accepted.data.deletionId); assert.equal(job.state, "COMPLETED"); assert.equal(job.resourceVersion, 2);
 const tombstone = await connection.db.collection<Project>("projects").findOne({ _id: saved.data.id }); assert.equal(tombstone?.lifecycle, "DELETED"); assert.ok(!JSON.stringify(tombstone).includes("Private"));
 const receipt = await connection.db.collection("idempotencyRecords").findOne({ operationId: saved.data.id }); assert.deepEqual(receipt?.responseBody, {});
 await assert.rejects(create(createKey), { code: "RESOURCE_NOT_FOUND" });
 assert.equal((await remove(saved.data.id, deleteKey)).replayed, true);
 await drainDeletions(connection); assert.equal(await connection.db.collection("deletionJobs").countDocuments({ state: "ACCEPTED" }), 0);
});
test("HTTP requires authentication, CSRF, revision, confirmation and idempotency", async () => {
 const saved = await create(), identity = { user, profile, sessionId: "delete-session" };
 async function send(body: unknown, extra: Record<string, string> = {}, authenticated = true) {
  return projectRequest(new Request(`${config.origin}/api/v1/projects/${saved.data.id}`, { method: "DELETE", headers: { Origin: config.origin, "Content-Type": "application/json", "X-CSRF-Token": csrfToken(identity, config.secret), "Idempotency-Key": randomUUID(), ...extra }, body: JSON.stringify(body) }), { connection, config, identity: authenticated ? identity : null }, saved.data.id);
 }
 assert.equal((await send(command, {}, false)).status, 401); assert.equal((await send(command, { Origin: "https://other.example" })).status, 403);
 assert.equal((await send(command, { "X-CSRF-Token": "bad" })).status, 403); assert.equal((await send(command, { "Idempotency-Key": "" })).status, 428);
 assert.equal((await send({ ...command, confirmation: "wrong" })).status, 422);
 const response = await send(command); assert.equal(response.status, 202); const body = await response.json();
 const read = await projectRequest(new Request(`${config.origin}/api/v1/deletions/${body.data.deletionId}`), { connection, config, identity });
 assert.equal(read.status, 200); assert.match(read.headers.get("cache-control")!, /no-store/);
 assert.deepEqual(Object.keys((await read.json()).data).sort(), ["id", "scope", "state", "resourceVersion", "updatedAt"].sort());
});
test("inactive accounts cannot delete or read retained receipts", async () => {
 const saved = await create(); await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: owner }, { $set: { lifecycle: "DELETING" } });
 try { await assert.rejects(remove(saved.data.id), { code: "ACCOUNT_DELETING" }); const job = await connection.db.collection("deletionJobs").findOne({}); await assert.rejects(readDeletion(connection, owner, String(job!._id)), { code: "ACCOUNT_DELETING" }); }
 finally { await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: owner }, { $set: { lifecycle: "ACTIVE" } }); }
});
