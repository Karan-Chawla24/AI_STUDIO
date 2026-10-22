import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getSchema } from "better-auth/db";
import { MongoServerError, type Db } from "mongodb";
import { authPolicy } from "./config";
import { profileValidator } from "./profile";
import { DatabaseError } from "../db/config";
import { migrateDatabase, runMigration } from "../db/migrations";

export const authSchema = getSchema(authPolicy);
export const authMigrationId = "F03_0001_auth_1_7_12";
const checksum = createHash("sha256").update(JSON.stringify({ adapter: "1.7.12", schema: authSchema, profileValidator })).digest("hex");

async function verifyAuthShape(db: Db) {
  for (const [name, table] of Object.entries(authSchema)) {
    const existing = await db.collection(name).listIndexes().toArray();
    for (const expected of table.indexes ?? []) {
      const actual = existing.find((i) => i.name === expected.name);
      const key = Object.fromEntries(expected.columns.map((c) => [c === "id" ? "_id" : c, 1]));
      if (!actual || !isDeepStrictEqual(actual.key, key) || !!actual.unique !== !!expected.unique || actual.sparse || actual.partialFilterExpression || actual.hidden || actual.expireAfterSeconds != null) {
        throw new DatabaseError("AUTH_INDEX_DRIFT", "Authentication indexes do not match the pinned adapter.");
      }
    }
  }
  const profile = await db.listCollections({ name: "userProfiles" }, { nameOnly: false }).next();
  if (!isDeepStrictEqual(profile?.options?.validator, profileValidator) || profile?.options?.validationLevel !== "strict" || profile?.options?.validationAction !== "error") {
    throw new DatabaseError("AUTH_SCHEMA_DRIFT", "User profile validation differs from the required schema.");
  }
}

export async function verifyAuthSchema(db: Db) {
  await verifyAuthShape(db);
  const record = await db.collection<{ _id: string; checksum: string; state: string }>("schemaMigrations").findOne({ _id: authMigrationId });
  if (record?.state !== "APPLIED" || record.checksum !== checksum) throw new DatabaseError("AUTH_MIGRATION_REQUIRED", "Run auth:migrate before enabling authentication.");
}

export async function migrateAuth(db: Db) {
  await migrateDatabase(db);
  return runMigration(db, authMigrationId, checksum, async () => {
    for (const [name, table] of Object.entries(authSchema)) {
      try { await db.createCollection(name); } catch (e) { if (!(e instanceof MongoServerError) || e.code !== 48) throw e; }
      for (const index of table.indexes ?? []) {
        await db.collection(name).createIndex(Object.fromEntries(index.columns.map((c) => [c === "id" ? "_id" : c, 1])), { name: index.name, unique: index.unique ?? false });
      }
    }
    try { await db.createCollection("userProfiles", { validator: profileValidator, validationLevel: "strict", validationAction: "error" }); }
    catch (e) { if (!(e instanceof MongoServerError) || e.code !== 48) throw e; }
    await verifyAuthShape(db);
  }, () => verifyAuthSchema(db));
}

/** The pinned adapter asks to ensure indexes on writes. Verify them instead; runtime cannot perform DDL. */
export function withPrebuiltIndexes(db: Db): Db {
  return new Proxy(db, { get(target, prop) {
    if (prop === "collection") return (name: string) => {
      const collection = target.collection(name);
      return new Proxy(collection, { get(col, method) {
        if (method === "createIndex") return async (keys: Record<string, number>, options: { name: string; unique?: boolean }) => {
          const actual = (await col.listIndexes().toArray()).find((i) => i.name === options.name);
          if (!actual || !isDeepStrictEqual(actual.key, keys) || !!actual.unique !== !!options.unique || actual.sparse || actual.partialFilterExpression || actual.hidden) throw new DatabaseError("AUTH_INDEX_DRIFT", "Authentication index verification failed.");
          return options.name;
        };
        const value = Reflect.get(col, method, col);
        return typeof value === "function" ? value.bind(col) : value;
      } });
    };
    const value = Reflect.get(target, prop, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
