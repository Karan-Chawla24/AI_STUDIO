
import { projectView } from "@/server/projects/project-view";
import { PlanEditor } from "@/components/plan-editor";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getIdentity } from "@/server/auth/service";
import { getDatabase } from "@/server/db/client";
import { readProject } from "@/server/projects/service";
import { ProjectError } from "@/server/projects/model";
export const metadata = { title: "Plan editor" };
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const identity = await getIdentity(await headers()); if (!identity) redirect("/sign-in");
  let project;
  try { project = await readProject(await getDatabase(), identity.user.id, (await params).projectId); }
  catch (error) { if (error instanceof ProjectError && error.status === 404) notFound(); throw error; }
  return <div className="page-content"><PlanEditor key={project._id} project={await projectView((await getDatabase()).db,project)} /></div>;
}
