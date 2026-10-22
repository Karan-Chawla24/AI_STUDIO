import "server-only";
import type { createAuth } from "./service";
import { activeIdentity } from "./service";
import type { DatabaseConnection } from "../db/client";

const cacheHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer" };
export function authError(code: string, message: string, status: number) { return Response.json({ code, message }, { status, headers: cacheHeaders }); }

export async function handleAuthRequest(request: Request, deps: { origin: string; auth: ReturnType<typeof createAuth>; connection: DatabaseConnection }) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  if (!(["/sign-up/email", "/sign-in/email", "/sign-out", "/send-verification-email", "/request-password-reset", "/reset-password", "/verify-email"].includes(path) && request.method === "POST") && !(path === "/get-session" && request.method === "GET")) {
    return authError("NOT_FOUND", "This account action is not available.", 404);
  }
  if (new URL(request.url).search) return authError("INVALID_BODY", "Query parameters are not accepted.", 400);
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
    const fields: Record<string, string[]> = {
      "/sign-up/email": ["name", "email", "password", "callbackURL"], "/sign-in/email": ["email", "password", "rememberMe", "callbackURL"],
      "/sign-out": [], "/send-verification-email": ["email"], "/request-password-reset": ["email"], "/reset-password": ["newPassword", "token"], "/verify-email": ["token"],
    };
    if (Object.keys(data).some((key) => !fields[path].includes(key)) || (data.callbackURL !== undefined && data.callbackURL !== "/home")) return authError("INVALID_BODY", "Unexpected account fields.", 400);
    if (["/verify-email", "/reset-password"].includes(path) && (typeof data.token !== "string" || !data.token || data.token.length > 2048)) return authError("INVALID_TOKEN", "This link is invalid or expired. Request a new one.", 400);
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
  // Email links carry secrets in fragments. The browser posts only after explicit confirmation.
  // Bridge verification to the pinned library's GET endpoint without exposing tokens in page URLs.
  const target = new URL(request.url);
  if (path === "/verify-email") target.searchParams.set("token", JSON.parse(body!).token);
  const sending = ["/send-verification-email", "/request-password-reset"].includes(path);
  if (sending) headers.delete("cookie"); // Public acknowledgement never varies with the current signed-in account.
  const started = Date.now();
  const response = await deps.auth.handler(new Request(target, { method: path === "/verify-email" ? "GET" : request.method, headers, body: path === "/verify-email" ? undefined : body }));
  if (sending) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 600 - (Date.now() - started))));
    if (response.status >= 500) console.error("ACCOUNT_EMAIL_DELIVERY_FAILED");
    if (response.ok || response.status >= 500) return Response.json({ status: true, message: "If this address is eligible, check your email for a link." }, { headers: cacheHeaders });
  }
  for (const [key, value] of Object.entries(cacheHeaders)) response.headers.set(key, value);
  return response;
}
