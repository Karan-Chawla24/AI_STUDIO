import { projectRoute } from "@/server/projects/route";
import { after } from "next/server";
import { getDatabase } from "@/server/db/client";
import { cleanDeletion } from "@/server/projects/deletion";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) { return projectRoute(request, (await context.params).projectId); }
export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const response = await projectRoute(request, (await context.params).projectId);
  if (response.status === 202) {
    const { data } = await response.clone().json();
    after(async () => { try { await cleanDeletion(await getDatabase(), data.deletionId); } catch { console.error("PROJECT_CLEANUP_RETRY_REQUIRED"); } });
  }
  return response;
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) { return projectRoute(request, (await context.params).projectId); }
