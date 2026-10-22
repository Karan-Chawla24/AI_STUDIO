import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDatabase, type DatabaseConnection } from "../src/server/db/client";
import { createAuth, activeIdentity } from "../src/server/auth/service";
import { handleAuthRequest } from "../src/server/auth/http";
import { migrateAuth, verifyAuthSchema } from "../src/server/auth/schema";
import { createEmailSender, type AccountEmail } from "../src/server/auth/email";

const origin = "http://localhost:3001";
const password = "Original test password 42";
const nextPassword = "Changed test password 43";
let server: MongoMemoryReplSet;
let connection: DatabaseConnection;
let auth: ReturnType<typeof createAuth>;
const messages: AccountEmail[] = [];
let failDelivery = false;
before(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1 } });
  connection = await connectDatabase({ uri: server.getUri(), database: "studio_email_test", production: false });
  await migrateAuth(connection.db);
  auth = createAuth(connection, { origin, secure: false, secret: randomBytes(32).toString("hex") }, { async send(message) { if (failDelivery) throw new Error("simulated delivery failure"); messages.push(message); } });
  assert.equal((await request("/sign-up/email", { name: "Email Tester", email: "email@example.com", password })).status, 200);
}, { timeout: 240_000 });
after(async () => { await connection?.client.close(); await server?.stop(); });
beforeEach(async () => { await connection.db.collection("rateLimit").deleteMany({}); messages.length = 0; failDelivery = false; });
function request(path: string, body: unknown, cookie = "", requestOrigin = origin) {
  return handleAuthRequest(new Request(`${origin}/api/auth${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: requestOrigin, cookie }, body: JSON.stringify(body) }), { auth, origin, connection });
}
function token(message: AccountEmail) { return new URLSearchParams(new URL(message.url).hash.slice(1)).get("token")!; }
async function login(pass = password) {
  const response = await request("/sign-in/email", { email: "email@example.com", password: pass });
  return { response, cookie: response.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ") };
}
test("preview configuration is local-only and missing provider config fails safely", () => {
  assert.throws(() => createEmailSender("https://studio.example", { EMAIL_DELIVERY: "preview" }));
  assert.throws(() => createEmailSender(origin, { EMAIL_DELIVERY: "preview", VERCEL: "1" }));
  assert.throws(() => createEmailSender(origin, { EMAIL_DELIVERY: "resend" }));
});
test("verification links are explicit, single-use and update authoritative identity", async () => {
  const session = await login();
  assert.equal((await request("/send-verification-email", { email: "email@example.com" })).status, 200);
  assert.equal(messages.length, 1); assert.equal(new URL(messages[0].url).search, "");
  const confirm = await request("/verify-email", { token: token(messages[0]) });
  assert.equal(confirm.status, 200, await confirm.clone().text());
  assert.equal((await activeIdentity(auth, connection, new Headers({ cookie: session.cookie })))?.user.emailVerified, true);
  assert.equal((await request("/verify-email", { token: token(messages[0]) })).status, 400);
  await verifyAuthSchema(connection.db);
});
test("recovery acknowledgements match for unknown addresses and provider errors", async () => {
  const unknown = await request("/request-password-reset", { email: "absent@example.com" });
  assert.equal(messages.length, 0);
  await connection.db.collection("rateLimit").deleteMany({});
  failDelivery = true;
  const failure = await request("/request-password-reset", { email: "email@example.com" });
  assert.equal(failure.status, unknown.status); assert.deepEqual(await failure.json(), await unknown.json());
});
test("reset validates password, revokes all sessions, rejects replay and preserves other accounts", async () => {
  const first = await login(); const second = await login();
  await request("/sign-up/email", { name: "Other", email: "other@example.com", password });
  const other = await request("/sign-in/email", { email: "other@example.com", password });
  const otherCookie = other.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  await request("/request-password-reset", { email: "email@example.com" });
  const value = token(messages[0]);
  assert.equal((await request("/reset-password", { token: value, newPassword: "short" })).status, 400);
  assert.equal((await request("/reset-password", { token: value, newPassword: nextPassword })).status, 200);
  assert.equal((await request("/reset-password", { token: value, newPassword: password })).status, 400);
  assert.equal(await activeIdentity(auth, connection, new Headers({ cookie: first.cookie })), null);
  assert.equal(await activeIdentity(auth, connection, new Headers({ cookie: second.cookie })), null);
  assert.ok(await activeIdentity(auth, connection, new Headers({ cookie: otherCookie })));
  assert.notEqual((await login()).response.status, 200); assert.equal((await login(nextPassword)).response.status, 200);
});
test("expired reset and verification links fail without changing the password", async () => {
  await request("/request-password-reset", { email: "email@example.com" });
  await connection.db.collection("verification").updateMany({}, { $set: { expiresAt: new Date(0) } });
  assert.equal((await request("/reset-password", { token: token(messages[0]), newPassword: password })).status, 400);
  await request("/send-verification-email", { email: "other@example.com" });
  await connection.db.collection("verification").updateMany({}, { $set: { expiresAt: new Date(0) } });
  assert.equal((await request("/verify-email", { token: token(messages[1]) })).status, 400);
  assert.equal((await login(nextPassword)).response.status, 200);
});
test("email endpoints enforce cooldown, origin and fixed navigation", async () => {
  const data = { email: "other@example.com" };
  assert.equal((await request("/send-verification-email", data)).status, 200);
  assert.equal((await request("/send-verification-email", data)).status, 429);
  assert.equal((await request("/request-password-reset", data, "", "https://evil.example")).status, 403);
  assert.equal((await request("/request-password-reset", { ...data, redirectTo: "https://evil.example" })).status, 400);
  assert.equal((await request("/verify-email?callbackURL=https://evil.example", { token: "x" })).status, 400);
  assert.equal((await request("/reset-password", { token: "x", newPassword: nextPassword, userId: "other" })).status, 400);
});
