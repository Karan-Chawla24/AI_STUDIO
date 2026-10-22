import { projectRoute } from "@/server/projects/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) { return projectRoute(request, (await context.params).projectId); }
