import { ideasRoute } from "@/server/projects/ideas-http";
type Context = { params: Promise<{ projectId: string; ideaPath: string[] }> };
async function handle(request: Request, context: Context) { const p = await context.params; return ideasRoute(request,p.projectId,p.ideaPath); }
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
