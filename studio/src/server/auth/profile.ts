import "server-only";
import type { Db } from "mongodb";

export type UserProfile = {
  _id: string; schemaVersion: number; version: number; createdAt: Date; updatedAt: Date;
  displayName: string; timezone: string; defaultVoiceKey: "INDIAN_MALE" | "INDIAN_FEMALE" | null;
  lifecycle: "ACTIVE" | "DELETING" | "DELETED"; fenceVersion: number; deletionId: string | null; emailVerified: boolean;
};

export async function provisionProfile(db: Db, user: { id: string; name: string; emailVerified: boolean }) {
  const now = new Date();
  await db.collection<UserProfile>("userProfiles").updateOne({ _id: user.id }, { $setOnInsert: {
    schemaVersion: 1, version: 1, createdAt: now, updatedAt: now,
    displayName: user.name, timezone: "UTC", defaultVoiceKey: null,
    lifecycle: "ACTIVE", fenceVersion: 1, deletionId: null, emailVerified: user.emailVerified,
  } }, { upsert: true });
  return db.collection<UserProfile>("userProfiles").findOne({ _id: user.id });
}

export const profileValidator = { $jsonSchema: {
  bsonType: "object", additionalProperties: false,
  required: ["_id", "schemaVersion", "version", "createdAt", "updatedAt", "displayName", "timezone", "defaultVoiceKey", "lifecycle", "fenceVersion", "deletionId", "emailVerified"],
  properties: {
    _id: { bsonType: "string", minLength: 1 }, schemaVersion: { enum: [1] },
    version: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 },
    createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
    displayName: { bsonType: "string", minLength: 1, maxLength: 100 }, timezone: { bsonType: "string", minLength: 1 },
    defaultVoiceKey: { enum: [null, "INDIAN_MALE", "INDIAN_FEMALE"] },
    lifecycle: { enum: ["ACTIVE", "DELETING", "DELETED"] },
    fenceVersion: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 },
    deletionId: { bsonType: ["string", "null"] }, emailVerified: { bsonType: "bool" },
  },
} };
