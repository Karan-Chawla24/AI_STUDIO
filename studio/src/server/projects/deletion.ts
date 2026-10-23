import "server-only";
import { createHash } from "node:crypto";
import type { Document } from "mongodb";
import { inTransaction, type DatabaseConnection } from "../db/client";
import type { UserProfile } from "../auth/profile";
import { ProjectError, projectIdPattern, uuid7, type Project } from "./model";
import { missingProject } from "./service";
import { verifyDeletion } from "./deletion-schema";
type Input = { expectedRevision: number; confirmation: "DELETE_PROJECT" };
type Accepted = { deletionId: string; state: "ACCEPTED" };
type Receipt = Document & { _id: string; requestHash: string; operationId: string; responseBody: Accepted; expiresAt: Date };
export type DeletionJob = { _id: string; ownerId: string; scope: "PROJECT"; targetId: string; state: "ACCEPTED" | "COMPLETED" | "REQUIRES_ATTENTION"; resourceVersion: number; updatedAt: Date; expiresAt: Date | null };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function validateDelete(value: unknown): Input {
  const data = value as Input;
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some(k => !["expectedRevision", "confirmation"].includes(k)) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 1 || data.confirmation !== "DELETE_PROJECT") throw new ProjectError("VALIDATION_FAILED", "Confirm deletion of the current project version.", 422);
  return { expectedRevision: data.expectedRevision, confirmation: "DELETE_PROJECT" };
}
export async function readDeletion(connection: DatabaseConnection, ownerId: string, id: string) {
  if (!projectIdPattern.test(id)) throw missingProject();
  if (!await connection.db.collection<UserProfile>("userProfiles").findOne({ _id: ownerId, lifecycle: "ACTIVE" })) throw new ProjectError("ACCOUNT_DELETING", "This account cannot access projects.", 403);
  const job = await connection.db.collection<DeletionJob>("deletionJobs").findOne({ _id: id, ownerId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
  if (!job) throw missingProject();
  return { id: job._id, scope: job.scope, state: job.state, resourceVersion: job.resourceVersion, updatedAt: job.updatedAt.toISOString() };
}
export async function deleteProject(connection: DatabaseConnection, ownerId: string, projectId: string, input: Input, key: string, requestId: string) {
  if (!projectIdPattern.test(projectId)) throw missingProject();
  await verifyDeletion(connection.db);
  const { db } = connection, now = new Date();
  const scope = { ownerId, method: "DELETE", routeKey: `/api/v1/projects/${projectId}`, keyHash: digest(key) };
  const requestHash = digest(JSON.stringify({ action: "PROJECT_DELETE", ...input }));
  const deletionId = uuid7(), receiptId = uuid7(), auditId = uuid7();
  const receipts = db.collection<Receipt>("idempotencyRecords");
  const data: Accepted = { deletionId, state: "ACCEPTED" };
  try {
    return await inTransaction(connection.client, async session => {
      const profile = await db.collection<UserProfile>("userProfiles").findOneAndUpdate({ _id: ownerId, lifecycle: "ACTIVE" }, { $inc: { fenceVersion: 1 } }, { session });
      if (!profile) throw new ProjectError("ACCOUNT_DELETING", "This account cannot delete projects.", 403);
      const receipt = await receipts.findOne(scope, { session });
      if (receipt && receipt.expiresAt > now) {
        if (receipt.requestHash !== requestHash) throw new ProjectError("IDEMPOTENCY_CONFLICT", "This retry key belongs to a different deletion request.", 409);
        if (!await db.collection<DeletionJob>("deletionJobs").findOne({ _id: receipt.operationId, ownerId }, { session })) throw missingProject();
        return { data: receipt.responseBody, replayed: true };
      }
      if (receipt) await receipts.deleteOne({ _id: receipt._id }, { session });
      const project = await db.collection<Project>("projects").findOne({ _id: projectId, ownerId, lifecycle: "ACTIVE" }, { session });
      if (!project) throw missingProject();
      if (project.revision !== input.expectedRevision) throw new ProjectError("REVISION_CONFLICT", "This project changed. Refresh it before deleting.", 409);
      // Fail closed when future features introduce resources this draft-only worker cannot clean.
      if (project.activeJobId || project.activeStoryboardId || project.latestRenderId || project.currentRenderId || project.publishFence.activeIntentId) throw new ProjectError("DELETION_UNAVAILABLE", "This project needs additional cleanup support before deletion.", 409);
      const changed = await db.collection<Project>("projects").updateOne({ _id: projectId, ownerId, lifecycle: "ACTIVE", revision: input.expectedRevision, resourceVersion: project.resourceVersion }, { $set: { lifecycle: "DELETING", deletedAt: now, deletionId, updatedAt: now, approval: null, "publishFence.blocked": true, "publishFence.reason": "PROJECT_DELETION" }, $inc: { resourceVersion: 1, "publishFence.epoch": 1 } }, { session });
      if (changed.matchedCount !== 1) throw new ProjectError("REVISION_CONFLICT", "Refresh this project before deleting.", 409);
      await db.collection("deletionJobs").insertOne({ _id: deletionId, schemaVersion: 1, ownerId, scope: "PROJECT", targetId: projectId, state: "ACCEPTED", resourceVersion: 1, createdAt: now, updatedAt: now, startedAt: null, completedAt: null, expiresAt: null, checkpoints: { draftPurged: false }, blockedIntentIds: [], error: null } as Document, { session });
      await receipts.insertOne({ _id: receiptId, schemaVersion: 1, createdAt: now, ...scope, requestHash, operationId: deletionId, responseStatus: 202, responseBody: data, state: "TERMINAL", terminalAt: now, expiresAt: new Date(now.getTime() + 7 * 86400_000) }, { session });
      await db.collection("auditEvents").insertOne({ _id: auditId, schemaVersion: 1, createdAt: now, ownerId, actorType: "USER", actorId: ownerId, action: "PROJECT_DELETE_REQUESTED", aggregateType: "PROJECT", aggregateId: projectId, requestId, jobId: null, details: { deletionId }, expiresAt: new Date(now.getTime() + 90 * 86400_000) } as Document, { session });
      return { data, replayed: false };
    });
  } catch (error) {
    if (error instanceof ProjectError) throw error;
    const receipt = await receipts.findOne(scope);
    if (receipt && receipt.expiresAt > new Date()) {
      if (receipt.requestHash !== requestHash) throw new ProjectError("IDEMPOTENCY_CONFLICT", "This retry key belongs to a different deletion request.", 409);
      await readDeletion(connection, ownerId, receipt.operationId);
      return { data: receipt.responseBody, replayed: true };
    }
    throw error;
  }
}
// No external effects: one transaction can atomically purge the draft and complete its durable job.
export async function cleanDeletion(connection: DatabaseConnection, id: string) {
  await verifyDeletion(connection.db);
  return inTransaction(connection.client, async session => {
    const jobs = connection.db.collection<DeletionJob>("deletionJobs");
    const job = await jobs.findOne({ _id: id, state: "ACCEPTED" }, { session });
    if (!job) return;
    const project = await connection.db.collection<Project>("projects").findOne({ _id: job.targetId, ownerId: job.ownerId }, { session });
    if (project && (project.lifecycle !== "DELETING" || project.deletionId !== id || project.activeJobId || project.activeStoryboardId || project.latestRenderId || project.currentRenderId || project.publishFence.activeIntentId)) {
      await jobs.updateOne({ _id: id, state: "ACCEPTED" }, { $set: { state: "REQUIRES_ATTENTION", updatedAt: new Date(), error: "UNSUPPORTED_DEPENDENCIES" }, $inc: { resourceVersion: 1 } }, { session }); return;
    }
    if (project) await connection.db.collection<Project>("projects").updateOne({ _id: job.targetId, ownerId: job.ownerId, lifecycle: "DELETING", deletionId: id }, { $set: { lifecycle: "DELETED", title: "Deleted project", titleSort: "deleted project", originalIdea: "Deleted", audience: null, niche: null, "settings.voiceKey": null, "settings.targetDurationSeconds": 75, updatedAt: new Date() }, $inc: { resourceVersion: 1 } }, { session });
    // Creation receipts contain the original idea; purge them with the project, not only on TTL.
    await connection.db.collection("idempotencyRecords").updateMany({ ownerId: job.ownerId, method: "POST", routeKey: "/api/v1/projects", operationId: job.targetId }, { $set: { responseBody: {} } }, { session });
    const now = new Date();
    await jobs.updateOne({ _id: id, state: "ACCEPTED" }, { $set: { state: "COMPLETED", updatedAt: now, startedAt: now, completedAt: now, expiresAt: new Date(now.getTime() + 90 * 86400_000), checkpoints: { draftPurged: true } }, $inc: { resourceVersion: 1 } }, { session });
  });
}
export async function drainDeletions(connection: DatabaseConnection) {
  await verifyDeletion(connection.db);
  const jobs = await connection.db.collection<DeletionJob>("deletionJobs").find({ state: "ACCEPTED" }).sort({ updatedAt: 1 }).limit(50).toArray();
  for (const job of jobs) await cleanDeletion(connection, job._id);
  return jobs.length;
}
