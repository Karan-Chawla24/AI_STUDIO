import "server-only";
import { getDatabase } from "../db/client";
import { getIdentity } from "../auth/service";
import { readAuthConfig } from "../auth/config";
import { projectFailure, projectRequest } from "./http";
import { ProjectError } from "./model";
export async function projectRoute(request: Request, id?: string) {
  try {
    const identity = await getIdentity(request.headers);
    if (!identity) return projectFailure(new ProjectError("AUTH_REQUIRED", "Please sign in to your account.", 401));
    return await projectRequest(request, { identity, connection: await getDatabase(), config: readAuthConfig() }, id);
  } catch (error) { return projectFailure(error); }
}
