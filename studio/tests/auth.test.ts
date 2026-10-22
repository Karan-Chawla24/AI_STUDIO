import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomBytes } from "node:crypto";
import { connectDatabase, type DatabaseConnection } from "../src/server/db/client";
import { readAuthConfig } from "../src/server/auth/config";
import { createAuth, activeIdentity } from "../src/server/auth/service";
import { migrateAuth, verifyAuthSchema } from "../src/server/auth/schema";
import { handleAuthRequest } from "../src/server/auth/http";
import type { UserProfile } from "../src/server/auth/profile";

const origin = "http://localhost:3001";
let server: MongoMemoryReplSet; let connection: DatabaseConnection; let auth: ReturnType<typeof createAuth>;
let cookie = ""; let firstId = "";
const password = "A strong test password 42";
before(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1 } });
  connection = await connectDatabase({ uri: server.getUri(), database: "studio_auth_test", production: false });
  await migrateAuth(connection.db);
  auth = createAuth(connection, { origin, secure: false, secret: randomBytes(32).toString("hex") });
}, { timeout: 240_000 });
after(async () => { await connection?.client.close(); await server?.stop(); });
function request(path: string, body?: unknown, cookies = "", requestOrigin: string | null = origin) {
  const headers = new Headers({ "Content-Type": "application/json", cookie: cookies });
  if (requestOrigin) headers.set("Origin", requestOrigin);
  return handleAuthRequest(new Request(origin + "/api/auth" + path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) }), { origin, auth, connection });
}

test("configuration rejects weak secrets and external HTTP origins", () => {
  assert.throws(() => readAuthConfig({ APP_ORIGIN: origin, BETTER_AUTH_SECRET: "short" }), /secret/);
  assert.throws(() => readAuthConfig({ APP_ORIGIN: "http://example.com", BETTER_AUTH_SECRET: "x".repeat(32) }), /HTTPS/);
});
test("auth migration is repeatable and exports actual adapter indexes", async () => {
  assert.equal(await migrateAuth(connection.db), "already-applied"); await verifyAuthSchema(connection.db);
});
test("signup provisions profile, hashes password and requires explicit login", async () => {
  const response = await request("/sign-up/email", { name: "Test Creator", email: "creator@example.com", password });
  assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json(); firstId = data.user.id;
  assert.equal(data.token, null);
  const account = await connection.db.collection("account").findOne({ providerId: "credential" });
  assert.ok(account?.password); assert.notEqual(account.password, password);
  const profile = await connection.db.collection<UserProfile>("userProfiles").findOne({ _id: firstId });
  assert.equal(profile?.lifecycle, "ACTIVE"); assert.equal(profile?.emailVerified, false);
});
test("duplicates and invalid credentials do not reveal registration status", async () => {
  const duplicate = await request("/sign-up/email", { name: "Test Creator", email: "creator@example.com", password });
  assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).token, null);
  const wrong = await request("/sign-in/email", { email: "creator@example.com", password: "wrong password" });
  const absent = await request("/sign-in/email", { email: "nobody@example.com", password: "wrong password" });
  assert.equal(wrong.status, absent.status); assert.equal((await wrong.json()).code, (await absent.json()).code);
});
test("sign-in issues HttpOnly SameSite cookie; identity is scoped to session", async () => {
  const response = await request("/sign-in/email", { email: "creator@example.com", password, rememberMe: true });
  assert.equal(response.status, 200, await response.clone().text());
  const setCookies = response.headers.getSetCookie();
  assert.ok(setCookies.some((c) => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)));
  cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const identity = await activeIdentity(auth, connection, new Headers({ cookie }));
  assert.equal(identity?.user.id, firstId);
  const secondSignup = await request("/sign-up/email", { name: "Second Creator", email: "second@example.com", password });
  assert.equal(secondSignup.status, 200);
  const secondLogin = await request("/sign-in/email", { email: "second@example.com", password });
  const secondCookie = secondLogin.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const second = await activeIdentity(auth, connection, new Headers({ cookie: secondCookie }));
  assert.equal(second?.user.email, "second@example.com"); assert.notEqual(second?.profile._id, firstId);
  assert.equal(await activeIdentity(auth, connection, new Headers()), null);
});
test("cross-origin, missing-origin and client-controlled identity fields are rejected", async () => {
  assert.equal((await request("/sign-out", {}, cookie, "https://evil.example")).status, 403);
  assert.equal((await request("/sign-out", {}, cookie, null)).status, 403);
  assert.equal((await request("/sign-up/email", { name: "X", email: "x@example.com", password, emailVerified: true })).status, 400);
  assert.equal((await request("/sign-in/email", { email: "creator@example.com", password, callbackURL: "https://evil.example" })).status, 400);
  assert.equal((await request("/update-user", { name: "attacker" }, cookie)).status, 404);
  assert.equal((await request("/sign-in/email", { email: "x".repeat(17_000), password })).status, 413);
});
test("deleting accounts cannot use old sessions or create new ones", async () => {
  await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: firstId }, { $set: { lifecycle: "DELETING" } });
  assert.equal(await activeIdentity(auth, connection, new Headers({ cookie })), null);
  assert.equal(await (await request("/get-session", undefined, cookie)).json(), null);
  assert.notEqual((await request("/sign-in/email", { email: "creator@example.com", password })).status, 200);
  await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: firstId }, { $set: { lifecycle: "ACTIVE" } });
});
test("sign-out revokes the current session even if its old cookie is replayed", async () => {
  assert.equal((await request("/sign-out", {}, cookie)).status, 200);
  assert.equal(await activeIdentity(auth, connection, new Headers({ cookie })), null);
});
test("rate limiting is enabled in development and persisted in MongoDB", async () => {
  await connection.db.collection("rateLimit").deleteMany({});
  let status = 0;
  for (let i = 0; i < 11; i++) status = (await request("/sign-in/email", { email: "rate@example.com", password })).status;
  assert.equal(status, 429);
  assert.ok(await connection.db.collection("rateLimit").countDocuments() > 0);
});
