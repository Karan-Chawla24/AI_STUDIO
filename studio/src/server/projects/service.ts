import "server-only";
import { createHash } from "node:crypto";
import type { Document } from "mongodb";
import { type DatabaseConnection, inTransaction } from "../db/client";
import type { UserProfile } from "../auth/profile";
import { ProjectError, projectDTO, uuid7, type CreateProject, type Project, type ProjectDTO, projectIdPattern } from "./model";
import { verifyProjects } from "./schema";

type Receipt = { _id: string; ownerId: string; method: string; routeKey: string; keyHash: string; requestHash: string; operationId: string; responseBody: ProjectDTO; expiresAt: Date };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const missingProject = () => new ProjectError("RESOURCE_NOT_FOUND", "This project is unavailable.", 404);
export async function readProject(connection: DatabaseConnection, ownerId: string, id: string) {
  if (!projectIdPattern.test(id)) throw missingProject();
  const profile = await connection.db.collection<UserProfile>("userProfiles").findOne({ _id: ownerId, lifecycle: "ACTIVE" });
  if (!profile) throw new ProjectError("ACCOUNT_DELETING", "This account cannot access projects.", 403);
  const project = await connection.db.collection<Project>("projects").findOne({ _id: id, ownerId, lifecycle: "ACTIVE" });
  if (!project) throw missingProject();
  return project;
}
export async function createProject(connection: DatabaseConnection, ownerId: string, input: CreateProject, key: string, requestId: string) {
  await verifyProjects(connection.db);
  const { db } = connection;
  const scope = { ownerId, method: "POST", routeKey: "/api/v1/projects", keyHash: digest(key) };
  const requestHash = digest(JSON.stringify({ action: "PROJECT_CREATE", ...input }));
  const id = uuid7(), receiptId = uuid7(), auditId = uuid7(); const now = new Date();
  const receipts = db.collection<Receipt>("idempotencyRecords");
  async function replay(receipt: Receipt) {
    if (receipt.requestHash !== requestHash) throw new ProjectError("IDEMPOTENCY_CONFLICT", "This retry key belongs to different project details.", 409);
    await readProject(connection, ownerId, receipt.operationId);
    return { data: receipt.responseBody, replayed: true };
  }
  try {
    return await inTransaction(connection.client, async (session) => {
      const profile = await db.collection<UserProfile>("userProfiles").findOneAndUpdate({ _id: ownerId, lifecycle: "ACTIVE" }, { $inc: { fenceVersion: 1 } }, { session, returnDocument: "after" });
      if (!profile) throw new ProjectError("ACCOUNT_DELETING", "This account cannot create projects.", 403);
      const existing = await receipts.findOne(scope, { session });
      if (existing && existing.expiresAt > now) {
        if (existing.requestHash !== requestHash) throw new ProjectError("IDEMPOTENCY_CONFLICT", "This retry key belongs to different project details.", 409);
        if (!await db.collection<Project>("projects").findOne({ _id: existing.operationId, ownerId, lifecycle: "ACTIVE" }, { session })) throw missingProject();
        return { data: existing.responseBody, replayed: true };
      }
      if (existing) await receipts.deleteOne({ _id: existing._id }, { session });
      const recent = await db.collection<Project>("projects").countDocuments({ ownerId, createdAt: { $gte: new Date(now.getTime() - 60_000) } }, { session, limit: 30 });
      if (recent >= 30) throw new ProjectError("RATE_LIMITED", "Please wait a minute before creating another draft.", 429);
      const project: Project = { _id: id, schemaVersion: 1, ownerId, createdAt: now, updatedAt: now, revision: 1, resourceVersion: 1,
        title: input.title, titleSort: input.title.normalize("NFC").toLowerCase(), originalIdea: input.originalIdea, refinedIdea: null, audience: input.audience, niche: input.niche,
        settings: { voiceKey: profile.defaultVoiceKey, captionStyle: "CLEAN", musicAssetId: null, targetDurationSeconds: input.targetDurationSeconds },
        nextStoryboardVersion: 1, activeStoryboardId: null, currentSnapshotHash: null, approval: null, latestRenderId: null, currentRenderId: null, activeJobId: null,
        socialCaptionDraft: null, warnings: [], lifecycle: "ACTIVE", deletedAt: null, deletionId: null,
        publishFence: { epoch: 0, blocked: false, activeIntentId: null, reason: null }, statusProjection: { creationStatus: "DRAFT", publicationStatus: "NOT_PUBLISHED", stale: false, computedAt: now } };
      const data = projectDTO(project);
      await db.collection<Project>("projects").insertOne(project, { session });
      await receipts.insertOne({ _id: receiptId, schemaVersion: 1, createdAt: now, ...scope, requestHash, operationId: id, responseStatus: 201, responseBody: data, state: "TERMINAL", terminalAt: now, expiresAt: new Date(now.getTime() + 7 * 86400_000) } as Receipt, { session });
      await db.collection<Document & { _id: string }>("auditEvents").insertOne({ _id: auditId, schemaVersion: 1, createdAt: now, ownerId, actorType: "USER", actorId: ownerId, action: "PROJECT_CREATED", aggregateType: "PROJECT", aggregateId: id, requestId, jobId: null, details: { defaultsVersion: "project-defaults-v1" }, expiresAt: new Date(now.getTime() + 90 * 86400_000) }, { session });
      return { data, replayed: false };
    });
  } catch (error) {
    if (error instanceof ProjectError) throw error;
    // A committed command survives a lost acknowledgement or unique-index race.
    const receipt = await receipts.findOne(scope);
    if (receipt && receipt.expiresAt > new Date()) return replay(receipt);
    throw error;
  }
}
