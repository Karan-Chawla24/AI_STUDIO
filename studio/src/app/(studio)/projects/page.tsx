import Link from "next/link";
import { ProjectLibrary } from "@/components/project-library";
export const metadata = { title: "Projects" };
export default function ProjectsPage() {
  return <div className="page-content"><header className="library-heading"><div className="page-heading"><p className="eyebrow">A home for your curiosity</p><h1>Your projects</h1><p className="lead">Every idea, ready for its next chapter.</p></div><Link className="button primary" href="/projects/new">Create a draft ↗</Link></header><ProjectLibrary /></div>;
}
