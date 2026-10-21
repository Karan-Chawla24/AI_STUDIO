import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { MongoServerError, type Db, type Document } from "mongodb";
import { DatabaseError } from "./config";

type MigrationRecord = {
  _id: string; checksum: string; state: "RUNNING" | "APPLIED" | "FAILED";
  startedAt: Date; finishedAt: Date | null; leaseOwner: string;
  leaseExpiresAt: Date; checkpoint: string;
};

// Service-only control records. Product collections arrive with their owning feature.
const schema = {
  $jsonSchema: {
    bsonType: "object",
    additionalProperties: false,
    required: ["_id", "checksum", "state", "startedAt", "finishedAt", "leaseOwner", "leaseExpiresAt", "checkpoint"],
    properties: {
      _id: { bsonType: "string", minLength: 1 },
      checksum: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
      state: { enum: ["RUNNING", "APPLIED", "FAILED"] },
      startedAt: { bsonType: "date" }, finishedAt: { bsonType: ["date", "null"] },
      leaseOwner: { bsonType: "string" }, leaseExpiresAt: { bsonType: "date" },
      checkpoint: { bsonType: "string" },
    },
  },
};
const index = { name: "migration_state_started", key: { state: 1, startedAt: 1 } } as const;
export const bootstrapId = "F02_0001_migration_control";
const checksum = createHash("sha256").update(JSON.stringify({ schema, index })).digest("hex");
const lockId = "__migration_lock__";

async function ensureControlCollection(db: Db): Promise<void> {
  try {
    await db.createCollection("schemaMigrations", { validator: schema, validationLevel: "strict", validationAction: "error" });
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 48) throw error;
  }
  const info = await db.listCollections({ name: "schemaMigrations" }, { nameOnly: false }).next();
  if (!isDeepStrictEqual(info?.options?.validator, schema) || info?.options?.validationLevel !== "strict" || info?.options?.validationAction !== "error") {
    throw new DatabaseError("DB_SCHEMA_DRIFT", "Migration control schema differs from the checked-in definition. Review before continuing.");
  }
}

export async function verifyDatabase(db: Db): Promise<void> {
  const info = await db.listCollections({ name: "schemaMigrations" }, { nameOnly: false }).next();
  if (!info || !isDeepStrictEqual(info.options?.validator, schema) || info.options?.validationLevel !== "strict" || info.options?.validationAction !== "error") {
    throw new DatabaseError("DB_SCHEMA_DRIFT", "Migration control collection is missing or has unexpected validation rules.");
  }
  const collection = db.collection<MigrationRecord>("schemaMigrations");
  const indexes = await collection.listIndexes().toArray();
  const actual = indexes.find((item) => item.name === index.name);
  if (!actual || !isDeepStrictEqual(actual.key, index.key) || actual.unique || actual.sparse || actual.partialFilterExpression || actual.expireAfterSeconds != null || actual.hidden) {
    throw new DatabaseError("DB_INDEX_DRIFT", "Migration control index is missing or differs from its definition.");
  }
  const record = await collection.findOne({ _id: bootstrapId });
  if (record?.state !== "APPLIED" || record.checksum !== checksum) {
    throw new DatabaseError("DB_MIGRATION_NOT_APPLIED", "The expected migration has not been applied, or its checksum differs.");
  }
}

/** Forward-only, idempotent bootstrap. Never drops collections/indexes or edits existing validators. */
export async function migrateDatabase(db: Db): Promise<"applied" | "already-applied"> {
  await ensureControlCollection(db);
  const records = db.collection<MigrationRecord>("schemaMigrations");
  const owner = randomUUID();
  const now = new Date();
  const base = { checksum, state: "RUNNING" as const, startedAt: now, finishedAt: null, leaseOwner: owner, leaseExpiresAt: new Date(now.getTime() + 600_000), checkpoint: "bootstrap" };
  try {
    await records.insertOne({ _id: lockId, ...base });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new DatabaseError("DB_MIGRATION_LOCKED", "Another migration holds the lock. Expired locks require operator review; they are never stolen automatically.");
    }
    throw error;
  }
  let started = false;
  try {
    const previous = await records.findOne({ _id: bootstrapId });
    if (previous && previous.checksum !== checksum) throw new DatabaseError("DB_CHECKSUM_MISMATCH", "An existing migration checksum differs. Do not edit previously applied migrations.");
    if (previous?.state === "APPLIED") {
      await verifyDatabase(db);
      return "already-applied";
    }
    await records.replaceOne({ _id: bootstrapId }, base, { upsert: true });
    started = true;
    await records.createIndex(index.key, { name: index.name });
    await records.updateOne({ _id: bootstrapId, leaseOwner: owner }, { $set: { state: "APPLIED", finishedAt: new Date(), checkpoint: "complete" } });
    await verifyDatabase(db);
    return "applied";
  } catch (error) {
    if (started) await records.updateOne({ _id: bootstrapId, leaseOwner: owner }, { $set: { state: "FAILED", finishedAt: new Date(), checkpoint: "failed; inspect database before rerun" } });
    throw error;
  } finally {
    await records.deleteOne({ _id: lockId, leaseOwner: owner });
  }
}

export async function migrationStatus(db: Db): Promise<Document[]> {
  if (!(await db.listCollections({ name: "schemaMigrations" }).hasNext())) return [];
  return db.collection("schemaMigrations").find({}, { projection: { _id: 1, state: 1, checkpoint: 1 } }).sort({ _id: 1 }).toArray();
}
