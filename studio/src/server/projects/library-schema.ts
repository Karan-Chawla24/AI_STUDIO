import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Db, IndexSpecification } from "mongodb";
import { runMigration } from "../db/migrations";
import { DatabaseError } from "../db/config";
import { migrateProjects, verifyProjects } from "./schema";
export const libraryIndexes: { name: string; key: IndexSpecification }[] = [
  { name: "project_owner_updated", key: { ownerId: 1, updatedAt: -1, _id: -1 } },
  { name: "project_owner_title", key: { ownerId: 1, titleSort: 1, _id: 1 } },
  { name: "project_creation_filter", key: { ownerId: 1, "statusProjection.creationStatus": 1, updatedAt: -1, _id: -1 } },
  { name: "project_publication_filter", key: { ownerId: 1, "statusProjection.publicationStatus": 1, updatedAt: -1, _id: -1 } },
];
const id = "F06_0001_library_indexes";
const partialFilterExpression = { lifecycle: "ACTIVE" };
const checksum = createHash("sha256").update(JSON.stringify({ libraryIndexes, partialFilterExpression })).digest("hex");
async function verifyShape(db: Db) {
  const indexes = await db.collection("projects").listIndexes().toArray();
  for (const expected of libraryIndexes) {
    const actual = indexes.find((index) => index.name === expected.name);
    if (!actual || !isDeepStrictEqual(actual.key, expected.key) || !isDeepStrictEqual(actual.partialFilterExpression, partialFilterExpression) || actual.unique || actual.sparse || actual.hidden || actual.expireAfterSeconds !== undefined) throw new DatabaseError("LIBRARY_INDEX_DRIFT", "Library indexes differ from their required definitions.");
  }
}
export async function verifyLibrary(db: Db) {
  await verifyProjects(db); await verifyShape(db);
  const record = await db.collection<{ _id: string; state: string; checksum: string }>("schemaMigrations").findOne({ _id: id });
  if (record?.state !== "APPLIED" || record.checksum !== checksum) throw new DatabaseError("LIBRARY_MIGRATION_REQUIRED", "Run library:migrate before enabling the library.");
}
export async function migrateLibrary(db: Db) {
  await migrateProjects(db);
  return runMigration(db, id, checksum, async () => {
    for (const { key, name } of libraryIndexes) await db.collection("projects").createIndex(key, { name, partialFilterExpression });
    await verifyShape(db);
  }, () => verifyLibrary(db));
}
