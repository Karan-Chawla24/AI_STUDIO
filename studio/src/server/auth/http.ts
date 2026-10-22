import "server-only";
import type { createAuth } from "./service";
import { activeIdentity } from "./service";
import type { DatabaseConnection } from "../db/client";

const cacheHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export function authError(code: string, message: string, status: number) { return Response.json({ code, message }, { status, headers: cacheHeaders }); }

export async function handleAuthRequest(request: Request, deps: { origin: string; auth: ReturnType<typeof createAuth>; connection: DatabaseConnection }) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  if (!(["/sign-up/email", "/sign-in/email", "/sign-out"].includes(path) && request.method === "POST") && !(path === "/get-session" && request.method === "GET")) {
    return authError("NOT_FOUND", "This account action is not available.", 404);
  }
  const headers = new Headers(request.headers);
  // On Vercel use its platform-controlled header. Locally all requests share a safe bucket.
  headers.set("x-studio-client-ip", process.env.VERCEL === "1" ? (request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1") : "127.0.0.1");
  let body: string | undefined;
  if (request.method === "POST") {
    if (request.headers.get("origin") !== deps.origin || request.headers.get("sec-fetch-site") === "cross-site") return authError("INVALID_ORIGIN", "Request origin is not allowed.", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return authError("INVALID_CONTENT_TYPE", "Use application/json.", 415);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 16_384) { await reader.cancel(); return authError("BODY_TOO_LARGE", "Request is too large.", 413); }
        chunks.push(value);
      }
    }
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      data = parsed as Record<string, unknown>;
    } catch { return authError("INVALID_BODY", "Enter valid account details.", 400); }
    const allowed = path === "/sign-up/email" ? ["name", "email", "password", "callbackURL"] : path === "/sign-in/email" ? ["email", "password", "rememberMe", "callbackURL"] : [];
    if (Object.keys(data).some((key) => !allowed.includes(key)) || (data.callbackURL !== undefined && data.callbackURL !== "/home")) return authError("INVALID_BODY", "Unexpected account fields.", 400);
    if (path === "/sign-up/email") {
      if (typeof data.name !== "string") return authError("INVALID_NAME", "Enter your name.", 400);
      data.name = data.name.normalize("NFC").trim();
      if (![...data.name as string].length || [...data.name as string].length > 100) return authError("INVALID_NAME", "Use a name of 1–100 characters.", 400);
    }
    body = JSON.stringify(data);
    headers.delete("content-length");
  } else if (!(await activeIdentity(deps.auth, deps.connection, headers))) {
    return Response.json(null, { headers: cacheHeaders });
  }
  const response = await deps.auth.handler(new Request(request.url, { method: request.method, headers, body }));
  response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Vary", "Cookie");
  return response;
}
