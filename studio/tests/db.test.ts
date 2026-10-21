import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { assertTransactionSupport, closeDatabase, connectDatabase, getDatabase, inTransaction, type DatabaseConnection } from "../src/server/db/client";
import { readDatabaseConfig } from "../src/server/db/config";
import { bootstrapId, migrateDatabase, verifyDatabase } from "../src/server/db/migrations";

test("configuration is explicit and never includes credentials in errors", () => {
  assert.throws(() => readDatabaseConfig({}), /MONGODB_URI/);
  assert.throws(() => readDatabaseConfig({ MONGODB_URI: "mongodb://localhost", MONGODB_DB_NAME: "admin" }), /dedicated/);
  assert.throws(() => readDatabaseConfig({ NODE_ENV: "production", MONGODB_URI: "mongodb://user:secret@localhost/?tls=false", MONGODB_DB_NAME: "studio" }), /requires TLS/);
  assert.throws(() => readDatabaseConfig({ MONGODB_URI: "mongodb://localhost/?tlsAllowInvalidCertificates=true", MONGODB_DB_NAME: "studio" }), /verification/);
  assert.equal(readDatabaseConfig({ MONGODB_URI: "mongodb://localhost", MONGODB_DB_NAME: "studio_dev" }).database, "studio_dev");
});

test("connection failures are bounded and sanitized", async () => {
  await assert.rejects(connectDatabase({ uri: "mongodb://user:do-not-leak@127.0.0.1:1", database: "studio_test", production: false }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Cannot connect/);
    assert.doesNotMatch(error.message, /do-not-leak|127\.0\.0\.1/);
    return true;
  });
});

let server: MongoMemoryReplSet;
let connection: DatabaseConnection;
before(async () => {
  // Always isolated; deliberately never read .env.local or a user's database URI.
  server = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
  connection = await connectDatabase({ uri: server.getUri(), database: "studio_foundation_test", production: false });
}, { timeout: 240_000 });
after(async () => { await connection?.client.close(); await server?.stop(); });

test("fresh migration, rerun, strict validation and index verification", async () => {
  const { db } = connection;
  await assertTransactionSupport(db);
  assert.equal(await migrateDatabase(db), "applied");
  assert.equal(await migrateDatabase(db), "already-applied");
  await verifyDatabase(db);
  await assert.rejects(db.collection("schemaMigrations").insertOne({ bad: "document" }), (error: unknown) => (error as { code: number }).code === 121);
});

test("live or expired migration locks prevent concurrent execution", async () => {
  const { db } = connection;
  const records = db.collection<{ _id: string; [key: string]: unknown }>("schemaMigrations");
  const row = await records.findOne({ _id: bootstrapId });
  assert.ok(row);
  await records.insertOne({ ...row, _id: "__migration_lock__", state: "RUNNING", leaseExpiresAt: new Date(0) });
  await assert.rejects(migrateDatabase(db), /Another migration/);
  await records.deleteOne({ _id: "__migration_lock__" });
});

test("checksum drift is rejected and lock is released", async () => {
  const { db } = connection;
  const records = db.collection<{ _id: string; checksum: string }>("schemaMigrations");
  const original = await records.findOne({ _id: bootstrapId });
  assert.ok(original);
  await records.updateOne({ _id: bootstrapId }, { $set: { checksum: "0".repeat(64) } });
  await assert.rejects(migrateDatabase(db), /checksum/);
  assert.equal(await records.countDocuments({ _id: "__migration_lock__" }), 0);
  await records.updateOne({ _id: bootstrapId }, { $set: { checksum: original.checksum } });
});

test("missing index is detected without silently altering applied migration", async () => {
  const { db } = connection;
  await db.collection("schemaMigrations").dropIndex("migration_state_started");
  await assert.rejects(verifyDatabase(db), /index/);
  await assert.rejects(migrateDatabase(db), /index/);
  await db.collection("schemaMigrations").createIndex({ state: 1, startedAt: 1 }, { name: "migration_state_started" });
});

test("business transaction rolls back both writes on failure", async () => {
  const { db, client } = connection;
  await db.createCollection("transactionProbe");
  await assert.rejects(inTransaction(client, async (session) => {
    await db.collection("transactionProbe").insertOne({ value: 1 }, { session });
    await db.collection("transactionProbe").insertOne({ value: 2 }, { session });
    throw new Error("intentional rollback");
  }), /intentional rollback/);
  assert.equal(await db.collection("transactionProbe").countDocuments(), 0);
  await inTransaction(client, async (session) => { await db.collection("transactionProbe").insertOne({ value: 3 }, { session }); });
  assert.equal(await db.collection("transactionProbe").countDocuments(), 1);
});

test("failed shared connection can recover and successful requests share a pool", async () => {
  const oldUri = process.env.MONGODB_URI;
  const oldName = process.env.MONGODB_DB_NAME;
  try {
    process.env.MONGODB_URI = "mongodb://127.0.0.1:1";
    process.env.MONGODB_DB_NAME = "studio_pool_test";
    await assert.rejects(getDatabase(), /Cannot connect/);
    process.env.MONGODB_URI = server.getUri();
    const first = getDatabase();
    const second = getDatabase();
    assert.equal(first, second);
    await first;
  } finally {
    await closeDatabase();
    if (oldUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = oldUri;
    if (oldName === undefined) delete process.env.MONGODB_DB_NAME; else process.env.MONGODB_DB_NAME = oldName;
  }
});

test("pre-existing incompatible schema is not overwritten", async () => {
  const db = connection.client.db("studio_schema_drift_test");
  await db.createCollection("schemaMigrations");
  await assert.rejects(migrateDatabase(db), /schema differs/);
  const info = await db.listCollections({ name: "schemaMigrations" }, { nameOnly: false }).next();
  assert.equal(info?.options?.validator, undefined);
});

test("CLI check, status, migrate and verify operate on an isolated database", async () => {
  const run = promisify(execFile);
  const env = { ...process.env, MONGODB_URI: server.getUri(), MONGODB_DB_NAME: "studio_cli_test" };
  const command = (action: string) => run(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/db.ts", action], { env, timeout: 20_000 });
  assert.match((await command("check")).stdout, /verified/);
  assert.deepEqual(JSON.parse((await command("status")).stdout), []);
  assert.match((await command("migrate")).stdout, /Migration: applied/);
  assert.match((await command("migrate")).stdout, /already-applied/);
  assert.match((await command("verify")).stdout, /verified/);
  assert.equal(JSON.parse((await command("status")).stdout)[0].state, "APPLIED");
});
