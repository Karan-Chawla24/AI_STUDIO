import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDatabase, type DatabaseConnection } from "../src/server/db/client";
import { provisionProfile, type UserProfile } from "../src/server/auth/profile";
import { migrateProjects, verifyProjects } from "../src/server/projects/schema";
import { createProject, readProject } from "../src/server/projects/service";
import { validateCreate, uuid7, type Project } from "../src/server/projects/model";
import { csrfToken, projectRequest } from "../src/server/projects/http";

let server: MongoMemoryReplSet; let connection: DatabaseConnection;
const config = { origin: "http://localhost:3001", secure: false, secret: randomBytes(32).toString("hex") };
const user = { id: "owner-a", name: "Project Tester", email: "projects@example.com", emailVerified: false, createdAt: new Date(), updatedAt: new Date() };
let profile: UserProfile; let id = "";
const input = validateCreate({ title: "Internet explained", originalIdea: "What happens when you open a website?" });
const identity = () => ({ user, profile, sessionId: "session-a" });
function request(body: unknown, options: { key?: string; csrf?: string; origin?: string; raw?: string; unauthenticated?: boolean; query?: string } = {}) {
  return projectRequest(new Request(config.origin + "/api/v1/projects" + (options.query ?? ""), { method: "POST", headers: { Origin: options.origin ?? config.origin, "Content-Type": "application/json", "Idempotency-Key": options.key ?? randomUUID(), "X-CSRF-Token": options.csrf ?? csrfToken(identity(), config.secret) }, body: options.raw ?? JSON.stringify(body) }), { connection, config, identity: options.unauthenticated ? null : identity() });
}
before(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1 } });
  connection = await connectDatabase({ uri: server.getUri(), database: "studio_projects_test", production: false });
  await migrateProjects(connection.db); profile = (await provisionProfile(connection.db, user))!;
  await provisionProfile(connection.db, { ...user, id: "owner-b" });
}, { timeout: 240_000 });
after(async () => { await connection?.client.close(); await server?.stop(); });

test("project migration is repeatable; text is NFC/code-point validated and fields are strict", async () => {
  assert.equal(await migrateProjects(connection.db), "already-applied"); await verifyProjects(connection.db);
  assert.equal(validateCreate({ title: " e\u0301 ", originalIdea: " x " }).title, "é");
  assert.equal(validateCreate({ title: "🚀".repeat(120), originalIdea: "x" }).title.length, 240);
  for (const bad of [{ title: " ", originalIdea: "x" }, { title: "x", originalIdea: "x".repeat(5001) }, { title: "x", originalIdea: "x", audience: null }, { title: "x", originalIdea: "x", ownerId: "owner-b" }, { title: "x", originalIdea: "x", targetDurationSeconds: 59 }, { title: "x", originalIdea: "x", targetDurationSeconds: 75.5 }]) assert.throws(() => validateCreate(bad));
});
test("unverified active user can create a complete draft with receipt and redacted audit", async () => {
  const response = await request({ title: input.title, originalIdea: input.originalIdea });
  assert.equal(response.status, 201, await response.clone().text()); const body = await response.json(); id = body.data.id;
  assert.match(id, /^[0-9a-f-]{14}7/); assert.equal(response.headers.get("location"), `/api/v1/projects/${id}`);
  assert.equal(body.data.settings.targetDurationSeconds, 75); assert.equal(body.data.settings.voiceKey, null);
  assert.equal(body.data.revision, 1); assert.equal(body.data.creationStatus, "DRAFT"); assert.equal(body.data.durationSeconds, null);
  assert.equal(body.data.ownerId, undefined); assert.equal(body.data._id, undefined); assert.ok(body.requestId);
  assert.equal(await connection.db.collection("idempotencyRecords").countDocuments({ operationId: id }), 1);
  const audit = await connection.db.collection("auditEvents").findOne({ aggregateId: id }); assert.ok(audit); assert.equal(JSON.stringify(audit).includes(input.originalIdea), false);
});
test("owner read persists; foreign, invalid, absent and deleted IDs stay inaccessible", async () => {
  assert.equal((await readProject(connection, user.id, id)).originalIdea, input.originalIdea);
  await assert.rejects(readProject(connection, "owner-b", id), { code: "RESOURCE_NOT_FOUND" });
  await assert.rejects(readProject(connection, user.id, "invalid"), { code: "RESOURCE_NOT_FOUND" });
  await assert.rejects(readProject(connection, user.id, uuid7()), { code: "RESOURCE_NOT_FOUND" });
  await connection.db.collection<Project>("projects").updateOne({ _id: id }, { $set: { lifecycle: "DELETED", deletedAt: new Date() } });
  await assert.rejects(readProject(connection, user.id, id), { code: "RESOURCE_NOT_FOUND" });
  await connection.db.collection<Project>("projects").updateOne({ _id: id }, { $set: { lifecycle: "ACTIVE", deletedAt: null } });
});
test("same-key concurrent requests create exactly one project; changed payload conflicts", async () => {
  const key = randomUUID(); const payload = { title: "Concurrent draft", originalIdea: "A retry-safe idea" };
  const responses = await Promise.all([request(payload, { key }), request(payload, { key }), request(payload, { key })]);
  const bodies = await Promise.all(responses.map((r) => r.json()));
  assert.deepEqual(responses.map((r) => r.status), [201, 201, 201]); assert.equal(new Set(bodies.map((b) => b.data.id)).size, 1);
  assert.equal(responses.filter((r) => r.headers.get("idempotent-replay") === "true").length, 2);
  assert.equal((await request({ ...payload, title: "Changed" }, { key })).status, 409);
  assert.equal(await connection.db.collection("projects").countDocuments({ title: payload.title }), 1);
});
test("receipt scope isolates owners and rejects replay for a deleted project", async () => {
  const key = randomUUID(); const first = await createProject(connection, user.id, input, key, randomUUID());
  const second = await createProject(connection, "owner-b", input, key, randomUUID()); assert.notEqual(first.data.id, second.data.id);
  await connection.db.collection<Project>("projects").updateOne({ _id: first.data.id }, { $set: { lifecycle: "DELETING" } });
  await assert.rejects(createProject(connection, user.id, input, key, randomUUID()), { code: "RESOURCE_NOT_FOUND" });
});
test("failed audit insert rolls back draft, receipt and profile fence", async () => {
  const count = await connection.db.collection("projects").countDocuments();
  const before = await connection.db.collection<UserProfile>("userProfiles").findOne({ _id: user.id });
  await assert.rejects(createProject(connection, user.id, input, randomUUID(), "x".repeat(129)));
  assert.equal(await connection.db.collection("projects").countDocuments(), count);
  assert.equal((await connection.db.collection<UserProfile>("userProfiles").findOne({ _id: user.id }))?.fenceVersion, before?.fenceVersion);
});
test("account lifecycle fence prevents creation after deletion begins", async () => {
  await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: user.id }, { $set: { lifecycle: "DELETING" } });
  assert.equal((await request({ title: input.title, originalIdea: input.originalIdea })).status, 403);
  await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: user.id }, { $set: { lifecycle: "ACTIVE" } });
});
test("API rejects missing identity, cross-origin/session CSRF, duplicate JSON, oversize and forged fields", async () => {
  const body = { title: "x", originalIdea: "y" };
  assert.equal((await request(body, { unauthenticated: true })).status, 401);
  assert.equal((await request(body, { origin: "https://evil.example" })).status, 403);
  assert.equal((await request(body, { csrf: csrfToken({ ...identity(), sessionId: "other-session" }, config.secret) })).status, 403);
  assert.equal((await request(body, { csrf: csrfToken(identity(), config.secret, Date.now() - 1000) })).status, 403);
  assert.equal((await request(body, { raw: '{"title":"one","t\\u0069tle":"two","originalIdea":"x"}' })).status, 400);
  assert.equal((await request(body, { raw: "{" })).status, 400);
  assert.equal((await request({ ...body, ownerId: "owner-b" })).status, 422);
  assert.equal((await request(body, { raw: "x".repeat(256 * 1024 + 1) })).status, 413);
  assert.equal((await request(body, { key: "" })).status, 428);
  assert.equal((await request(body, { query: "?ownerId=owner-b" })).status, 400);
});
test("conditional GET rechecks ownership before returning 304", async () => {
  const get = (idValue: string, etag?: string, actor = identity()) => projectRequest(new Request(config.origin + `/api/v1/projects/${idValue}`, { headers: etag ? { "If-None-Match": etag } : {} }), { connection, config, identity: actor }, idValue);
  const first = await get(id); assert.equal(first.status, 200); assert.equal(first.headers.get("cache-control"), "private, no-cache");
  assert.equal((await get(id, first.headers.get("etag")!)).status, 304);
  assert.equal((await get(id, first.headers.get("etag")!, { ...identity(), user: { ...user, id: "owner-b" } })).status, 404);
});
test("expired terminal receipt is replaced even before TTL cleanup", async () => {
  const key = randomUUID(); const first = await createProject(connection, "owner-b", input, key, randomUUID());
  await connection.db.collection("idempotencyRecords").updateOne({ operationId: first.data.id }, { $set: { expiresAt: new Date(0) } });
  assert.notEqual((await createProject(connection, "owner-b", input, key, randomUUID())).data.id, first.data.id);
});
test("database rejects invalid states and missing indexes block creation", async () => {
  await assert.rejects(connection.db.collection<Project>("projects").updateOne({ _id: id }, { $set: { revision: 0 } }));
  await connection.db.collection("auditEvents").dropIndex("audit_aggregate");
  await assert.rejects(createProject(connection, user.id, input, randomUUID(), randomUUID()), { code: "PROJECT_INDEX_DRIFT" });
  await connection.db.collection("auditEvents").createIndex({ aggregateType: 1, aggregateId: 1, createdAt: -1 }, { name: "audit_aggregate" });
});
test("creation limit counts persisted drafts and returns Retry-After", async () => {
  const template = (await readProject(connection, user.id, id));
  await connection.db.collection<Project>("projects").insertMany(Array.from({ length: 30 }, () => ({ ...template, _id: uuid7(), createdAt: new Date() })));
  const response = await request({ title: "Limited", originalIdea: "Try later" }); assert.equal(response.status, 429); assert.equal(response.headers.get("Retry-After"), "60");
});
