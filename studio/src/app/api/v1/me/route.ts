import { randomUUID } from "node:crypto";
import { getIdentity } from "@/server/auth/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const requestId = randomUUID();
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Request-Id": requestId };
  const failure = (code: string, message: string, status: number, action: string, retryable = false) => Response.json({ error: { code, message, retryable, fieldErrors: [], details: {}, action }, requestId }, { status, headers });
  try {
    const identity = await getIdentity(request.headers);
    if (!identity) return failure("UNAUTHENTICATED", "Please sign in.", 401, "SIGN_IN");
    if (new URL(request.url).search) return failure("VALIDATION_ERROR", "This endpoint accepts no query parameters.", 400, "NONE");
    return Response.json({ data: { id: identity.user.id, displayName: identity.profile.displayName, email: identity.user.email, emailVerified: identity.user.emailVerified, timezone: identity.profile.timezone, defaultVoiceKey: identity.profile.defaultVoiceKey, version: identity.profile.version, createdAt: identity.profile.createdAt.toISOString() }, requestId }, { headers });
  } catch { return failure("SERVICE_UNAVAILABLE", "Account services are temporarily unavailable.", 503, "RETRY_LATER", true); }
}
