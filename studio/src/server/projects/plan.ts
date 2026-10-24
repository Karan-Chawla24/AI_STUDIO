import "server-only";
import type { Document } from "mongodb";
import { inTransaction, type DatabaseConnection } from "../db/client";
import type { UserProfile } from "../auth/profile";
import { ProjectError, projectDTO, projectIdPattern, uuid7, type Project } from "./model";
import { missingProject } from "./service";
import { verifyPlan } from "./plan-schema";
export type PlanPatch = { expectedRevision: number; title?: string; refinedIdea?: string; audience?: string | null; niche?: string | null };
const editable = ["title", "refinedIdea", "audience", "niche"] as const;
export function validatePlan(input: unknown): PlanPatch {
  const fail = (path: string, message: string): never => { throw new ProjectError("VALIDATION_FAILED", "Check your plan details.", 422, [{ path, code: "INVALID_VALUE", message }]); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("/", "Use a plan object.");
  const data = input as Record<string, unknown>;
  if (data.expectedRevision === undefined) throw new ProjectError("PRECONDITION_REQUIRED", "A saved revision is required.", 428);
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 1) fail("/expectedRevision", "Use a positive whole revision.");
  if (Object.keys(data).some(k => !["expectedRevision", ...editable].includes(k))) fail("/", "Unexpected plan field.");
  if (!editable.some(k => k in data)) fail("/", "Include at least one editable field.");
  const result: PlanPatch = { expectedRevision: data.expectedRevision as number };
  for (const field of editable) if (field in data) {
    const value = data[field], nullable = field === "audience" || field === "niche";
    if (nullable && value === null) { result[field] = null; continue; }
    if (typeof value !== "string") return fail(`/${field}`, "Enter text.");
    const normalized = value.normalize("NFC").trim(), max = field === "title" ? 120 : field === "refinedIdea" ? 5000 : 200;
    if (!normalized || [...normalized].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(normalized)) fail(`/${field}`, `Use 1–${max} characters.`);
    result[field] = normalized;
  }
  return result;
}
export async function updatePlan(connection: DatabaseConnection, ownerId: string, id: string, patch: PlanPatch, requestId: string) {
  if (!projectIdPattern.test(id)) throw missingProject();
  await verifyPlan(connection.db);
  const auditId = uuid7();
  return inTransaction(connection.client, async session => {
    const { db } = connection;
    if (!await db.collection<UserProfile>("userProfiles").findOneAndUpdate({ _id: ownerId, lifecycle: "ACTIVE" }, { $inc: { fenceVersion: 1 } }, { session })) throw new ProjectError("ACCOUNT_DELETING", "This account cannot edit projects.", 403);
    const project = await db.collection<Project>("projects").findOne({ _id: id, ownerId, lifecycle: "ACTIVE" }, { session });
    if (!project) throw missingProject();
    if (project.revision !== patch.expectedRevision) throw new ProjectError("REVISION_CONFLICT", "This project changed in another session. Review the latest saved version.", 409, [], { currentRevision: project.revision });
    if (project.activeStoryboardId || project.activeJobId || project.publishFence.activeIntentId) throw new ProjectError("PLAN_EDIT_UNAVAILABLE", "This project requires editing support for its active work.", 409);
    const changedFields = editable.filter(k => patch[k] !== undefined && patch[k] !== project[k]);
    if (!changedFields.length) return projectDTO(project);
    const now = new Date(), changes = Object.fromEntries(changedFields.map(k => [k, patch[k]]));
    if (patch.title !== undefined) changes.titleSort = patch.title.toLowerCase();
    const updated = await db.collection<Project>("projects").findOneAndUpdate({ _id: id, ownerId, lifecycle: "ACTIVE", revision: patch.expectedRevision, resourceVersion: project.resourceVersion }, { $set: { ...changes, updatedAt: now }, $inc: { revision: 1, resourceVersion: 1, "publishFence.epoch": 1 } }, { session, returnDocument: "after" });
    if (!updated) throw new ProjectError("REVISION_CONFLICT", "Refresh the saved plan before retrying.", 409);
    await db.collection("auditEvents").insertOne({ _id: auditId, schemaVersion: 1, createdAt: now, ownerId, actorType: "USER", actorId: ownerId, action: "PROJECT_PLAN_UPDATED", aggregateType: "PROJECT", aggregateId: id, requestId, jobId: null, details: { changedFields, fromRevision: project.revision, toRevision: updated.revision }, expiresAt: new Date(now.getTime() + 90 * 86400_000) } as Document, { session });
    return projectDTO(updated);
  });
}
