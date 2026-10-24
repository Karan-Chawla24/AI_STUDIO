import type { Document } from "mongodb";
// Apply to the F07 shape; prior migration definitions and checksums remain unchanged.
export function planShape(name: string, original: Document): Document {
  const result = structuredClone(original);
  if (name === "projects") result.$jsonSchema.properties.refinedIdea = { bsonType: ["string", "null"], minLength: 1, maxLength: 5000 };
  if (name === "auditEvents") {
    const fields = result.$jsonSchema.properties;
    fields.action = { enum: ["PROJECT_CREATED", "PROJECT_DELETE_REQUESTED", "PROJECT_PLAN_UPDATED"] };
    fields.details = { oneOf: [...fields.details.oneOf, { bsonType: "object", additionalProperties: false, required: ["changedFields", "fromRevision", "toRevision"], properties: {
      changedFields: { bsonType: "array", minItems: 1, maxItems: 4, uniqueItems: true, items: { enum: ["title", "refinedIdea", "audience", "niche"] } },
      fromRevision: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 }, toRevision: { bsonType: ["int", "long", "double"], minimum: 2, multipleOf: 1 }
    } }] };
  }
  return result;
}
