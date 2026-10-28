import {migrateCompilation} from "../src/server/projects/compile-schema";
import {creationStatuses} from "../src/shared/project-library";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDatabase, type DatabaseConnection } from "../src/server/db/client";
import { provisionProfile, type UserProfile } from "../src/server/auth/profile";
import { createProject, readProject } from "../src/server/projects/service";
import { uuid7, validateCreate, type Project } from "../src/server/projects/model";
import { listProjects, parseLibraryQuery, dashboard } from "../src/server/projects/library";
import { migrateLibrary, verifyLibrary } from "../src/server/projects/library-schema";
import { projectRequest } from "../src/server/projects/http";

let server: MongoMemoryReplSet, connection: DatabaseConnection;
const keys = { current: "a".repeat(40) }; const owner = "library-owner", other = "library-other";
const user = { id: owner, name: "Library Tester", email: "library@example.com", emailVerified: false, createdAt: new Date(), updatedAt: new Date() };
let profile: UserProfile; const rows: Project[] = [];
const query = (values: Record<string, string> = {}) => parseLibraryQuery(new URLSearchParams(values));
before(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1 } });
  connection = await connectDatabase({ uri: server.getUri(), database: "studio_library_test", production: false });
  await migrateLibrary(connection.db); profile = (await provisionProfile(connection.db, user))!; await provisionProfile(connection.db, { ...user, id: other });
  const saved = await createProject(connection, owner, validateCreate({ title: "Seed", originalIdea: "A private idea never included in summaries." }), randomUUID(), randomUUID());
  const template = await readProject(connection, owner, saved.data.id); await connection.db.collection("projects").deleteMany({});
  const base = Date.now() - 3600_000;
  for (let i = 0; i < 60; i++) rows.push({ ...template, _id: uuid7(), title: `Idea ${String(i).padStart(2,"0")}`, titleSort: `idea ${String(i).padStart(2,"0")}`, createdAt: new Date(base + Math.floor(i / 3)), updatedAt: new Date(base + Math.floor(i / 4)) });
  rows.push({ ...template, _id: uuid7(), title: ".* Literal", titleSort: ".* literal" }, { ...template, _id: uuid7(), title: "[Alpha]", titleSort: "[alpha]" });
  await connection.db.collection<Project>("projects").insertMany([...rows, { ...template, _id: uuid7(), ownerId: other }, { ...template, _id: uuid7(), lifecycle: "DELETED", deletedAt: new Date() }]);
}, { timeout: 240_000 });
after(async () => { await connection?.client.close(); await server?.stop(); });

test("additive indexes migrate repeatably without changing F05 schema", async () => { assert.equal(await migrateLibrary(connection.db), "already-applied"); await verifyLibrary(connection.db); });
test("strict query validation rejects duplicate/unknown fields and invalid limits/statuses", () => {
  for (const value of ["limit=0", "limit=51", "limit=1.5", "q=", "q=" + "x".repeat(81), "sort=nope", "ownerId=other", "limit=2&limit=3", "creationStatus=UNKNOWN", "publicationStatus=", "cursor="]) assert.throws(() => parseLibraryQuery(new URLSearchParams(value)));
  assert.equal(query().limit, 20); assert.equal(query({ q: "  IDEA " }).q, "idea");
});
test("all sort orders page through ties without duplicates or foreign/deleted projects", async () => {
  for (const sort of ["updated_desc", "created_desc", "title_asc"]) {
    const ids: string[] = []; let cursor: string | null = null;
    do { const page = await listProjects(connection, owner, query({ sort, limit: "7", ...(cursor ? { cursor } : {}) }), keys); ids.push(...page.items.map((item) => item.id)); assert.ok(page.items.length <= 7); cursor = page.page.nextCursor; assert.equal(page.page.hasMore, !!cursor); } while (cursor);
    assert.equal(ids.length, rows.length); assert.equal(new Set(ids).size, rows.length);
    const field = sort === "title_asc" ? "titleSort" : sort === "created_desc" ? "createdAt" : "updatedAt"; const sign = sort === "title_asc" ? 1 : -1;
    const expected = [...rows].sort((a,b) => sign * (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : a._id < b._id ? -1 : 1)).map((row) => row._id);
    assert.deepEqual(ids, expected);
  }
});
test("literal normalized prefix search and intersected filters return correct results", async () => {
  assert.equal((await listProjects(connection, owner, query({ q: ".*" }), keys)).items[0]?.title, ".* Literal");
  assert.equal((await listProjects(connection, owner, query({ q: "[a" }), keys)).items.length, 1);
  const filtered = await listProjects(connection, owner, query({ q: " IDEA 0 ", creationStatus: "DRAFT", publicationStatus: "NOT_PUBLISHED", limit: "50" }), keys);
  assert.equal(filtered.items.length, 10);
  assert.equal((await listProjects(connection, owner, query({ creationStatus: "VIDEO_READY" }), keys)).items.length, 0);
  assert.equal((await listProjects(connection, owner, query({ publicationStatus: "PUBLISHED" }), keys)).items.length, 0);
});
test("cursor rejects tampering, owner/filter/sort/limit mismatch and expiry", async () => {
  const now = Date.now(), page = await listProjects(connection, owner, query({ limit: "2" }), keys, now); const cursor = page.page.nextCursor!;
  const cases = [query({ limit: "2", cursor: cursor.slice(0,-1) + (cursor.endsWith("a") ? "b" : "a") }), query({ limit: "2", cursor, q: "idea" }), query({ limit: "2", cursor, sort: "title_asc" }), query({ limit: "3", cursor })];
  for (const value of cases) await assert.rejects(listProjects(connection, owner, value, keys), { code: "INVALID_CURSOR" });
  await assert.rejects(listProjects(connection, other, query({ limit: "2", cursor }), keys), { code: "INVALID_CURSOR" });
  await assert.rejects(listProjects(connection, owner, query({ limit: "2", cursor }), keys, now + 1800_001), { code: "CURSOR_EXPIRED" });
});
test("signing-key rotation accepts the previous key only when configured", async () => {
  const page = await listProjects(connection, owner, query({ limit: "2" }), keys); const next = query({ limit: "2", cursor: page.page.nextCursor! });
  assert.equal((await listProjects(connection, owner, next, { current: "b".repeat(40), previous: keys.current })).items.length, 2);
  await assert.rejects(listProjects(connection, owner, next, { current: "b".repeat(40) }), { code: "INVALID_CURSOR" });
});
test("asOf excludes later creations and each page rechecks account lifecycle", async () => {
  const now = Date.now(); const first = await listProjects(connection, owner, query({ limit: "50", sort: "created_desc" }), keys, now);
  const later = { ...rows[0], _id: uuid7(), createdAt: new Date(now + 10_000) }; await connection.db.collection<Project>("projects").insertOne(later);
  const next = query({ limit: "50", sort: "created_desc", cursor: first.page.nextCursor! });
  assert.equal((await listProjects(connection, owner, next, keys, now + 10_001)).items.some((item) => item.id === later._id), false);
  await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: owner }, { $set: { lifecycle: "DELETING" } });
  await assert.rejects(listProjects(connection, owner, next, keys), { code: "ACCOUNT_DELETING" });
  await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: owner }, { $set: { lifecycle: "ACTIVE" } }); await connection.db.collection<Project>("projects").deleteOne({ _id: later._id });
});
test("dashboard counts persisted active projects, limits recents and omits private fields", async () => {
  const result = await dashboard(connection, owner, keys); assert.equal(result.counts.projectsTotal, 62); assert.equal(result.counts.drafts, 62); assert.equal(result.recentProjects.length, 5); assert.deepEqual(result.upcomingSchedules, []);
  for (const item of result.recentProjects) { assert.equal("ownerId" in item, false); assert.equal("originalIdea" in item, false); assert.equal("computedAt" in item, false); }
  assert.equal((await dashboard(connection, other, keys)).counts.projectsTotal, 1);
});
test("HTTP lists require identity, return envelopes and private no-store responses", async () => {
  const config = { origin: "http://localhost:3001", secret: keys.current, secure: false };
  const deps = { connection, config, identity: { user, profile, sessionId: "library-session" } };
  const req = new Request(config.origin + "/api/v1/projects?limit=2");
  assert.equal((await projectRequest(req, { ...deps, identity: null })).status, 401);
  const response = await projectRequest(req, deps); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("vary"), "Cookie"); assert.ok((await response.json()).requestId);
  assert.equal((await projectRequest(new Request(config.origin + "/api/v1/dashboard?q=x"), deps)).status, 400);
});

test("approved storyboard status is selectable and filters the authenticated library through HTTP",async()=>{
 await migrateCompilation(connection.db);
 assert.ok(creationStatuses.includes("STORYBOARD_APPROVED"));
 const approvedId=rows[0]._id;
 await connection.db.collection<Project>("projects").updateMany({$or:[{_id:approvedId},{ownerId:other},{lifecycle:"DELETED"}]},{$set:{"statusProjection.creationStatus":"STORYBOARD_APPROVED"}});
 const filtered=await listProjects(connection,owner,query({creationStatus:"STORYBOARD_APPROVED"}),keys);assert.deepEqual(filtered.items.map(p=>p.id),[approvedId]);
 const config={origin:"http://localhost:3001",secret:keys.current,secure:false};
 const response=await projectRequest(new Request(config.origin+"/api/v1/projects?creationStatus=STORYBOARD_APPROVED"),{connection,config,identity:{user,profile,sessionId:"library-session"}});
 assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body.data.items.map((p:{id:string})=>p.id),[approvedId]);assert.equal(body.data.items[0].creationStatus,"STORYBOARD_APPROVED");
});
