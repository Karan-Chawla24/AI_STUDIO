import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Filter, Sort } from "mongodb";
import type { DatabaseConnection } from "../db/client";
import type { UserProfile } from "../auth/profile";
import { ProjectError, projectIdPattern, type Project } from "./model";
import { creationStatuses, publicationStatuses, type ProjectPage, type ProjectSummary, type Dashboard } from "../../shared/project-library";

const sorts = ["updated_desc", "created_desc", "title_asc"] as const;
type Query = { limit: number; sort: typeof sorts[number]; q: string; creationStatus: string; publicationStatus: string; cursor: string | null };
type Cursor = { v: 1; endpoint: "projects"; owner: string; binding: string; asOf: number; expires: number; last: { value: string; id: string } };
export type CursorKeys = { current: string; previous?: string };
export function cursorKeys(secret: string, env: Record<string, string | undefined> = process.env): CursorKeys {
  const current = env.PROJECT_CURSOR_SECRET || secret, previous = env.PROJECT_CURSOR_PREVIOUS_SECRET || undefined;
  if (current.length < 32 || (previous && previous.length < 32)) throw new Error("Invalid cursor signing configuration");
  return { current, previous };
}
export function parseLibraryQuery(params: URLSearchParams): Query {
  const invalid = (): never => { throw new ProjectError("INVALID_QUERY", "Check the search, filters and sort options.", 400); };
  for (const key of params.keys()) if (!["limit", "sort", "q", "creationStatus", "publicationStatus", "cursor"].includes(key) || params.getAll(key).length !== 1) invalid();
  const limit = params.get("limit") ?? "20", sort = params.get("sort") ?? "updated_desc";
  const q = (params.get("q") ?? "").normalize("NFC").trim().toLowerCase();
  const creationStatus = params.get("creationStatus") ?? "", publicationStatus = params.get("publicationStatus") ?? "", cursor = params.get("cursor");
  if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit) || !sorts.includes(sort as Query["sort"])) invalid();
  if ((params.has("q") && !q) || [...q].length > 160 || [...(params.get("q") ?? "").normalize("NFC").trim()].length > 80 || /[\u0000-\u001f]/.test(q)) invalid();
  if ((params.has("creationStatus") && !creationStatuses.includes(creationStatus as typeof creationStatuses[number])) || (params.has("publicationStatus") && !publicationStatuses.includes(publicationStatus as typeof publicationStatuses[number]))) invalid();
  if (cursor !== null && (!cursor || cursor.length > 2048)) throw new ProjectError("INVALID_CURSOR", "Refresh the project list.", 400);
  return { limit: Number(limit), sort: sort as Query["sort"], q, creationStatus, publicationStatus, cursor };
}
const mac = (key: string, value: string) => createHmac("sha256", key).update(`project-library-v1:${value}`).digest("base64url");
function binding(query: Query) { return JSON.stringify([query.limit, query.sort, query.q, query.creationStatus, query.publicationStatus]); }
function decode(value: string, ownerId: string, query: Query, keys: CursorKeys, now: number): Cursor {
  const invalid = (): never => { throw new ProjectError("INVALID_CURSOR", "This page link is invalid. Refresh the project list.", 400); };
  const [body, signature, extra] = value.split(".");
  if (extra !== undefined || !body || !signature || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) invalid();
  const key = [keys.current, keys.previous].find((candidate) => candidate && timingSafeEqual(Buffer.from(mac(candidate, body)), Buffer.from(signature)));
  if (!key) invalid();
  let cursor: Cursor;
  try { cursor = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return invalid(); }
  if (!cursor! || cursor.v !== 1 || cursor.endpoint !== "projects" || cursor.owner !== mac(key!, ownerId) || cursor.binding !== binding(query) || !Number.isSafeInteger(cursor.asOf) || !Number.isSafeInteger(cursor.expires) || cursor.asOf > now || cursor.expires !== cursor.asOf + 1800_000 || !cursor.last || typeof cursor.last.value !== "string" || !projectIdPattern.test(cursor.last.id)) invalid();
  if (cursor.expires <= now) throw new ProjectError("CURSOR_EXPIRED", "This page link expired. Refresh the project list.", 400);
  if (query.sort !== "title_asc" && !Number.isFinite(Date.parse(cursor.last.value))) invalid();
  return cursor;
}
async function active(connection: DatabaseConnection, ownerId: string) {
  if (!await connection.db.collection<UserProfile>("userProfiles").findOne({ _id: ownerId, lifecycle: "ACTIVE" })) throw new ProjectError("ACCOUNT_DELETING", "This account cannot access projects.", 403);
}
function summary(project: Project): ProjectSummary {
  return { id: project._id, title: project.title, revision: project.revision, resourceVersion: project.resourceVersion, creationStatus: project.statusProjection.creationStatus, publicationStatus: project.statusProjection.publicationStatus, stale: project.statusProjection.stale, durationSeconds: null, thumbnailAvailable: false, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString(), allowedActions: ["OPEN", "DELETE"] };
}
const projection = { _id: 1, title: 1, titleSort: 1, revision: 1, resourceVersion: 1, statusProjection: 1, createdAt: 1, updatedAt: 1 };
export async function listProjects(connection: DatabaseConnection, ownerId: string, query: Query, keys: CursorKeys, now = Date.now()): Promise<ProjectPage> {
  await active(connection, ownerId);
  const cursor = query.cursor ? decode(query.cursor, ownerId, query, keys, now) : null;
  const asOf = cursor?.asOf ?? now;
  const filter: Filter<Project> = { ownerId, lifecycle: "ACTIVE", createdAt: { $lte: new Date(asOf) } };
  if (query.q) filter.titleSort = { $regex: `^${query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` };
  if (query.creationStatus) filter["statusProjection.creationStatus"] = query.creationStatus;
  if (query.publicationStatus) filter["statusProjection.publicationStatus"] = query.publicationStatus;
  const field = query.sort === "title_asc" ? "titleSort" : query.sort === "created_desc" ? "createdAt" : "updatedAt";
  const direction = query.sort === "title_asc" ? 1 : -1;
  if (cursor) {
    const value = field === "titleSort" ? cursor.last.value : new Date(cursor.last.value);
    const operator = direction === 1 ? "$gt" : "$lt";
    filter.$and = [{ $or: [{ [field]: { [operator]: value } }, { [field]: value, _id: { [operator]: cursor.last.id } }] }];
  }
  const rows = await connection.db.collection<Project>("projects").find(filter, { projection, maxTimeMS: 5000 }).sort({ [field]: direction, _id: direction } as Sort).limit(query.limit + 1).toArray();
  const hasMore = rows.length > query.limit; const items = rows.slice(0, query.limit); const last = items.at(-1);
  let nextCursor: string | null = null;
  if (hasMore && last) {
    const payload: Cursor = { v: 1, endpoint: "projects", owner: mac(keys.current, ownerId), binding: binding(query), asOf, expires: asOf + 1800_000, last: { id: last._id, value: field === "titleSort" ? last.titleSort : last[field].toISOString() } };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url"); nextCursor = `${encoded}.${mac(keys.current, encoded)}`;
  }
  return { items: items.map(summary), page: { hasMore, nextCursor, limit: query.limit } };
}
export async function dashboard(connection: DatabaseConnection, ownerId: string, keys: CursorKeys): Promise<Dashboard> {
  await active(connection, ownerId); const now = Date.now();
  const rows = await connection.db.collection<Project>("projects").aggregate<{ _id: string; count: number }>([{ $match: { ownerId, lifecycle: "ACTIVE", createdAt: { $lte: new Date(now) } } }, { $group: { _id: "$statusProjection.creationStatus", count: { $sum: 1 } } }], { maxTimeMS: 5000 }).toArray();
  const counts = new Map(rows.map((row) => [row._id, row.count]));
  const recent = await listProjects(connection, ownerId, parseLibraryQuery(new URLSearchParams({ limit: "5" })), keys, now);
  return { asOf: new Date(now).toISOString(), counts: { projectsTotal: rows.reduce((sum, row) => sum + row.count, 0), drafts: counts.get("DRAFT") ?? 0, needsReview: counts.get("STORYBOARD_REVIEW") ?? 0, readyVideos: 0, activeJobs: 0, scheduledPosts: 0, attentionItems: counts.get("NEEDS_ATTENTION") ?? 0 }, recentProjects: recent.items, upcomingSchedules: [] };
}
