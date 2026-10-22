import { getDatabase } from "@/server/db/client";
import { readAuthConfig } from "@/server/auth/config";
import { getAuth } from "@/server/auth/service";
import { authError, handleAuthRequest } from "@/server/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try { return await handleAuthRequest(request, { origin: readAuthConfig().origin, auth: await getAuth(), connection: await getDatabase() }); }
  catch { return authError("AUTH_UNAVAILABLE", "Account services are temporarily unavailable. Please try again.", 503); }
}
export { handle as GET, handle as POST };
