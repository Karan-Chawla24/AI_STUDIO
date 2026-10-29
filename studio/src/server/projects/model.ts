import "server-only";
import type { jobDTO } from "./ideas-model";
import { randomBytes } from "node:crypto";

export class ProjectError extends Error {
  constructor(public code: string, message: string, public status: number, public fieldErrors: { path: string; code: string; message: string }[] = [], public details: Record<string, unknown> = {}) { super(message); }
}
export function uuid7() {
  const bytes = randomBytes(16); bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6] & 15) | 112; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex"); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type CreateProject = { title: string; originalIdea: string; audience: string | null; niche: string | null; targetDurationSeconds: number };
export function validateCreate(input: unknown): CreateProject {
  const invalid = (path: string, message: string): never => { throw new ProjectError("VALIDATION_FAILED", "Check your project details.", 422, [{ path, code: "INVALID_VALUE", message }]); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid("/", "Enter a project object.");
  const data = input as Record<string, unknown>;
  for (const key of Object.keys(data)) if (!["title", "originalIdea", "audience", "niche", "targetDurationSeconds"].includes(key)) invalid("/", "Unexpected project field.");
  function text(key: string, max: number, optional = false) {
    if (optional && data[key] === undefined) return null;
    if (typeof data[key] !== "string") return invalid(`/${key}`, `Use text of 1–${max} characters.`);
    const value = (data[key] as string).normalize("NFC").trim();
    if (![...value].length || [...value].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return invalid(`/${key}`, `Use text of 1–${max} characters.`);
    return value;
  }
  const duration = data.targetDurationSeconds ?? 75;
  if (data.targetDurationSeconds === null || typeof duration !== "number" || !Number.isInteger(duration) || duration < 60 || duration > 90) invalid("/targetDurationSeconds", "Choose a whole number from 60 to 90 seconds.");
  return { title: text("title", 120)!, originalIdea: text("originalIdea", 5000)!, audience: text("audience", 200, true), niche: text("niche", 200, true), targetDurationSeconds: duration as number };
}
export type Project = {
  _id: string; schemaVersion: 1; ownerId: string; createdAt: Date; updatedAt: Date; revision: number; resourceVersion: number;
  title: string; titleSort: string; originalIdea: string; audience: string | null; niche: string | null; refinedIdea: string | null;
  settings: { voiceKey: "INDIAN_MALE" | "INDIAN_FEMALE" | "TEST_MALE" | "TEST_FEMALE" | null; captionStyle: "CLEAN"|"BOLD"|"HIGHLIGHTED"; musicAssetId: null; targetDurationSeconds: number };
  nextStoryboardVersion: number; activeStoryboardId: string | null; currentSnapshotHash: string|null; approval: {storyboardId:string;snapshotHash:string;approvedBy:string;approvedAt:Date}|null; latestRenderId: null; currentRenderId: null; activeJobId: string | null;
  socialCaptionDraft: null; warnings: { code: "PLAN_CHANGED"; message: string; sceneId: null; severity: "WARNING" }[]; lifecycle: "ACTIVE" | "DELETING" | "DELETED"; deletedAt: Date | null; deletionId: string | null;
  publishFence: { epoch: number; blocked: boolean; activeIntentId: null; reason: string | null };
  statusProjection: { creationStatus: "DRAFT" | "PLANNING" | "NEEDS_ATTENTION" | "STORYBOARD_REVIEW"|"STORYBOARD_APPROVED"; publicationStatus: "NOT_PUBLISHED"; stale: false; computedAt: Date };
};
export function projectDTO(project: Project, activeJob: ReturnType<typeof jobDTO> | null = null) {
  return { id: project._id, title: project.title, revision: project.revision, resourceVersion: project.resourceVersion,
    creationStatus: project.statusProjection.creationStatus, publicationStatus: "NOT_PUBLISHED" as const, stale: false, durationSeconds: null, thumbnailAvailable: false,
    createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString(), allowedActions: ["OPEN", "EDIT_PLAN", "DELETE"], originalIdea: project.originalIdea,
    refinedIdea: project.refinedIdea, audience: project.audience, niche: project.niche, activeStoryboardId: project.activeStoryboardId, storyboardVersion: project.activeStoryboardId ? project.nextStoryboardVersion - 1 : null,
    settings: project.settings, currentSnapshotHash: project.currentSnapshotHash, approval: project.approval?{storyboardId:project.approval.storyboardId,snapshotHash:project.approval.snapshotHash,approvedAt:project.approval.approvedAt.toISOString()}:null, activeJob, latestRender: null, warnings: project.warnings };
}
export type ProjectDTO = ReturnType<typeof projectDTO>;

export const planChangedWarning: Project["warnings"] = [{code:"PLAN_CHANGED",message:"Your plan changed after this storyboard was accepted. Generate and accept a replacement to update the scenes.",sceneId:null,severity:"WARNING"}];
