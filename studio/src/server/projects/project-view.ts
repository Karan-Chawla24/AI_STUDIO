import "server-only";
import type { Db, ClientSession } from "mongodb";
import { projectDTO, type Project } from "./model";
import { jobDTO, type IdeaJob } from "./ideas-model";
export async function projectView(db: Db, project: Project, session?: ClientSession) {
 const job=project.activeJobId?await db.collection<IdeaJob>("generationJobs").findOne({_id:project.activeJobId,ownerId:project.ownerId,projectId:project._id},{session}):null;
 return projectDTO(project,job?jobDTO(job):null);
}
