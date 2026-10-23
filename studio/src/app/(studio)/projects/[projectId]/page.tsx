import Link from "next/link";
import { DeleteProject } from "@/components/delete-project";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getIdentity } from "@/server/auth/service";
import { getDatabase } from "@/server/db/client";
import { readProject } from "@/server/projects/service";
import { ProjectError } from "@/server/projects/model";
export const metadata = { title: "Saved draft" };
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const identity = await getIdentity(await headers()); if (!identity) redirect("/sign-in");
  let project;
  try { project = await readProject(await getDatabase(), identity.user.id, (await params).projectId); }
  catch (error) { if (error instanceof ProjectError && error.status === 404) notFound(); throw error; }
  return <div className="page-content"><header className="page-heading"><p className="eyebrow">Your starting point, saved</p><h1>{project.title}</h1><p className="lead">A draft today. A clear explanation tomorrow.</p></header><section className="saved-project" aria-labelledby="saved-idea"><div className="saved-project-bar"><span className="status-label">Draft · Saved to your account</span><span>{project.settings.targetDurationSeconds}s target</span></div><h2 id="saved-idea">Your idea</h2><p className="saved-idea">{project.originalIdea}</p><dl className="project-facts"><div><dt>Audience</dt><dd>{project.audience ?? "Not specified"}</dd></div><div><dt>Niche</dt><dd>{project.niche ?? "Not specified"}</dd></div><div><dt>Captions</dt><dd>Clean · enabled</dd></div><div><dt>Music</dt><dd>None</dd></div></dl><p className="field-hint">Find this draft anytime in your project library. Editing tools arrive in an upcoming milestone.</p></section><DeleteProject id={project._id} title={project.title} revision={project.revision} /><div className="project-next"><Link className="button secondary" href="/projects">Back to projects</Link><p>Your idea is safely stored. Storyboard generation is not available yet.</p><Link className="button secondary" href="/projects/new">Create another draft</Link></div></div>;
}
