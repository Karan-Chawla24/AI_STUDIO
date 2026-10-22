import { projectRoute } from "@/server/projects/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return projectRoute(request); }
