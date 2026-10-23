import type { Document } from "mongodb";

// Derive the forward-compatible shape without changing the immutable F05 migration.
export function deletionShape(name: string, original: Document): Document {
  const result = structuredClone(original);
  const fields = result.$jsonSchema.properties;
  if (name === "idempotencyRecords") {
    fields.method = { enum: ["POST", "DELETE"] };
    fields.routeKey = { bsonType: "string", pattern: "^/api/v1/projects(?:/[0-9a-f-]{36})?$" };
    fields.responseStatus = { enum: [201, 202] };
  }
  if (name === "auditEvents") {
    fields.action = { enum: ["PROJECT_CREATED", "PROJECT_DELETE_REQUESTED"] };
    fields.details = { oneOf: [fields.details, { bsonType: "object", additionalProperties: false, required: ["deletionId"], properties: { deletionId: { bsonType: "string", pattern: "^[0-9a-f-]{36}$" } } }] };
  }
  return result;
}
