import "server-only";
import type { PlanningProposal } from "./storyboard-model";
import { ProjectError, uuid7 } from "./model";
export type Idea = { id: string; title: string; refinedIdea: string; rationale: string };
export type IdeaInput = { expectedRevision: number; count: number; guidance: string };
export type IdeaJob = { _id: string; schemaVersion: number; ownerId: string; projectId: string; createdAt: Date; updatedAt: Date; resourceVersion: number; kind: "IDEA_BRAINSTORM" | "IDEA_REFINE" | "STORYBOARD_GENERATE" | "SCENE_REGENERATE" | "STORYBOARD_COMPILE"; state: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "SUPERSEDED" | "REQUIRES_ATTENTION"; active: boolean; stage: "QUEUED" | "PLANNING" | "FINISHED"; baseRevision: number; input: { title: string; idea: string; audience: string | null; niche: string | null; duration: number; count: number; guidance: string; model: string; compileContext?: import("./storyboard-model").StoryboardDTO; sceneContext?: {storyboard:import("./storyboard-model").StoryboardDTO;sceneId:string;scope:"NARRATION"|"VISUALS"|"BOTH"} } | null; inputHash: string; proposalIds: string[]; cancelRequested: boolean; lease: { holder: string | null; epoch: number; expiresAt: Date | null }; startedAt: Date | null; finishedAt: Date | null; error: { code: string; message: string } | null; unsafeToRetry: boolean };
export type Proposal = { _id: string; schemaVersion: number; ownerId: string; projectId: string; createdAt: Date; updatedAt: Date; version: number; kind: "IDEAS"; baseRevision: number; targetSceneId: null; state: "PENDING" | "APPLIED" | "DISMISSED" | "CONFLICTED"; payload: { ideas: Idea[] }; payloadHash: string; sourceJobId: string; appliedStoryboardId: null; appliedAt: Date | null };
export function ideaInput(value: unknown, refine: boolean): IdeaInput {
  const d = value as Record<string, unknown>;
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new ProjectError("VALIDATION_FAILED", "Use an idea request object.", 422);
  if (d.expectedRevision === undefined) throw new ProjectError("PRECONDITION_REQUIRED", "Save your plan first.", 428);
  if (Object.keys(d).some(k => !["expectedRevision", "guidance", ...(refine ? [] : ["count"])].includes(k)) || !Number.isSafeInteger(d.expectedRevision) || Number(d.expectedRevision) < 1 || (d.guidance !== undefined && typeof d.guidance !== "string")) throw new ProjectError("VALIDATION_FAILED", "Check the idea request.", 422);
  const count = refine ? 1 : d.count ?? 5, guidance = String(d.guidance ?? "").normalize("NFC").trim();
  if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 10 || [...guidance].length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(guidance)) throw new ProjectError("VALIDATION_FAILED", "Use 1–10 ideas and guidance up to 1,000 characters.", 422);
  return { expectedRevision: Number(d.expectedRevision), count: Number(count), guidance };
}
export function validateIdeas(value: unknown, count: number): Idea[] {
  const fail = (): never => { throw new ProjectError("INVALID_PROVIDER_OUTPUT", "The AI response could not be validated. Your plan is unchanged.", 502); };
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).join() !== "ideas") return fail();
  const ideas = (value as { ideas: unknown }).ideas;
  if (!Array.isArray(ideas) || ideas.length !== count) return fail();
  return ideas.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).sort().join() !== "rationale,refinedIdea,title") return fail();
    const text = (key: string, max: number) => { if (typeof row[key] !== "string") return fail(); const v = row[key].normalize("NFC").trim(); if (!v || [...v].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) return fail(); return v as string; };
    return { id: uuid7(), title: text("title", 120), refinedIdea: text("refinedIdea", 5000), rationale: text("rationale", 500) };
  });
}
export function proposalDTO(p: PlanningProposal) { return { id: p._id, projectId: p.projectId, kind: p.kind, baseRevision: p.baseRevision, targetSceneId: p.targetSceneId, state: p.state, version: p.version, payload: p.payload, createdAt: p.createdAt.toISOString() }; }
export function jobDTO(j: IdeaJob) { return { id: j._id, projectId: j.projectId, resourceVersion: j.resourceVersion, kind: j.kind, state: j.state === "RUNNING" && j.cancelRequested ? "CANCEL_REQUESTED" : j.state, stage: j.stage, baseRevision: j.baseRevision, snapshotHash: null, renderId: null, proposalIds: j.proposalIds, completedUnits: j.state === "SUCCEEDED" ? 1 : 0, totalUnits: 1, pollAfterMs: j.active ? 3000 : null, allowedActions: j.active && !j.unsafeToRetry ? ["CANCEL"] : [], startedAt: j.startedAt?.toISOString() ?? null, finishedAt: j.finishedAt?.toISOString() ?? null, error: j.error, warnings: [], cancelRequested: j.cancelRequested, retryOfJobId: null }; }
