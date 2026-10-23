import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { getIdentity } from "../auth/service";
import { readAuthConfig } from "../auth/config";
import type { DatabaseConnection } from "../db/client";
import { ProjectError, projectDTO, validateCreate } from "./model";
import { createProject, readProject } from "./service";
import { cursorKeys, dashboard, listProjects, parseLibraryQuery } from "./library";
import { verifyLibrary } from "./library-schema";

type Identity = NonNullable<Awaited<ReturnType<typeof getIdentity>>>;
export function csrfToken(identity: Identity, secret: string, expires = Date.now() + 3600_000) {
  return `${expires}.${createHmac("sha256", secret).update(`csrf:${identity.user.id}:${identity.sessionId}:${expires}`).digest("hex")}`;
}
function validCsrf(value: string | null, identity: Identity, secret: string) {
  if (!value || !/^\d{13}\.[a-f0-9]{64}$/.test(value)) return false;
  const expires = Number(value.split(".")[0]);
  if (expires <= Date.now() || expires > Date.now() + 3600_000) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(csrfToken(identity, secret, expires)));
}
export async function strictJSON(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ProjectError("UNSUPPORTED_MEDIA_TYPE", "Use application/json.", 415);
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 256 * 1024) { await reader.cancel(); throw new ProjectError("PAYLOAD_TOO_LARGE", "Project request is too large.", 413); } chunks.push(value); }
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const value: unknown = JSON.parse(raw);
    const tokens = raw.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g) ?? [];
    const stack: (Set<string> | null)[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === "{") stack.push(new Set()); else if (token === "[") stack.push(null); else if (token === "}" || token === "]") stack.pop();
      else if (token.startsWith('"') && tokens[i + 1] === ":") { const key = JSON.parse(token); const keys = stack.at(-1); if (keys?.has(key)) throw new Error(); keys?.add(key); }
    }
    return value;
  } catch { throw new ProjectError("MALFORMED_JSON", "Use valid JSON without duplicate keys.", 400); }
}
export async function projectRequest(request: Request, deps: { connection: DatabaseConnection; identity: Identity | null; config: ReturnType<typeof readAuthConfig> }, projectId?: string) {
  const requestId = randomUUID();
  const headers = new Headers({ "X-Request-Id": requestId, "Cache-Control": "private, no-store", Vary: "Cookie" });
  try {
    if (!deps.identity) throw new ProjectError("AUTH_REQUIRED", "Please sign in to your account.", 401);
    const url = new URL(request.url);
    if (request.method === "GET" && !projectId && url.pathname === "/api/v1/projects") {
      const query = parseLibraryQuery(url.searchParams);
      await verifyLibrary(deps.connection.db);
      return Response.json({ data: await listProjects(deps.connection, deps.identity.user.id, query, cursorKeys(deps.config.secret)), requestId }, { headers });
    }
    if (new URL(request.url).search) throw new ProjectError("INVALID_QUERY", "This endpoint accepts no query parameters.", 400);
    if (request.method === "GET" && url.pathname === "/api/v1/dashboard") {
      await verifyLibrary(deps.connection.db);
      return Response.json({ data: await dashboard(deps.connection, deps.identity.user.id, cursorKeys(deps.config.secret)), requestId }, { headers });
    }
    if (request.method === "GET" && projectId) {
      const data = projectDTO(await readProject(deps.connection, deps.identity.user.id, projectId));
      const tag = `"project-${data.id}-${data.resourceVersion}"`; headers.set("ETag", tag); headers.set("Cache-Control", "private, no-cache");
      if (request.headers.get("if-none-match")?.split(",").map((t) => t.trim().replace(/^W\//, "")).some((t) => t === tag || t === "*")) return new Response(null, { status: 304, headers });
      return Response.json({ data, requestId }, { headers });
    }
    if (request.method === "GET" && new URL(request.url).pathname === "/api/v1/csrf") return Response.json({ data: { token: csrfToken(deps.identity, deps.config.secret) }, requestId }, { headers });
    if (request.method !== "POST" || projectId) throw new ProjectError("METHOD_NOT_ALLOWED", "This action is not available.", 405);
    if (request.headers.get("origin") !== deps.config.origin || request.headers.get("sec-fetch-site") === "cross-site" || !validCsrf(request.headers.get("x-csrf-token"), deps.identity, deps.config.secret)) throw new ProjectError("CSRF_FAILED", "Refresh your session and try again.", 403);
    const input = validateCreate(await strictJSON(request));
    const key = request.headers.get("idempotency-key");
    if (!key) throw new ProjectError("PRECONDITION_REQUIRED", "An Idempotency-Key is required.", 428);
    if (!/^[\x20-\x7e]{16,128}$/.test(key)) throw new ProjectError("VALIDATION_FAILED", "Use a retry key of 16–128 printable characters.", 422);
    const result = await createProject(deps.connection, deps.identity.user.id, input, key, requestId);
    headers.set("Location", `/api/v1/projects/${result.data.id}`); if (result.replayed) headers.set("Idempotent-Replay", "true");
    return Response.json({ data: result.data, requestId }, { status: 201, headers });
  } catch (error) { return projectFailure(error, requestId, headers); }
}
export function projectFailure(error: unknown, requestId = randomUUID(), headers = new Headers({ "X-Request-Id": requestId, "Cache-Control": "private, no-store", Vary: "Cookie" })) {
  const failure = error instanceof ProjectError ? error : new ProjectError("SERVICE_UNAVAILABLE", "Project services are temporarily unavailable. Retry with the same details.", 503);
  if ([429, 503].includes(failure.status)) headers.set("Retry-After", failure.status === 429 ? "60" : "3");
  return Response.json({ error: { code: failure.code, message: failure.message, retryable: [429, 503].includes(failure.status), fieldErrors: failure.fieldErrors, details: {}, action: failure.status === 401 ? "SIGN_IN" : [429, 503].includes(failure.status) ? "RETRY_LATER" : "NONE" }, requestId }, { status: failure.status, headers });
}
