import type { Document } from "mongodb";
export function ideasShape(name: string, original: Document): Document {
 const v = structuredClone(original), p = v.$jsonSchema.properties;
 if (name === "projects") { p.activeJobId = { bsonType: ["string", "null"] }; p.statusProjection.properties.creationStatus = { enum: ["DRAFT", "PLANNING", "NEEDS_ATTENTION"] }; }
 if (name === "idempotencyRecords") { p.routeKey = { bsonType: "string", pattern: "^/api/v1/projects(?:/[0-9a-f-]{36}(?:/(?:ideas/(?:brainstorm|refine)|proposals/[0-9a-f-]{36}/(?:apply|dismiss)|jobs/[0-9a-f-]{36}/cancel))?)?$" }; p.responseStatus = { enum: [200,201,202,409] }; p.state = { enum: ["ACCEPTED", "TERMINAL"] }; p.terminalAt = { bsonType: ["date", "null"] }; p.expiresAt = { bsonType: ["date", "null"] }; }
 return v;
}
