import {snapshotHash} from "./compiler";
import type {Storyboard} from "./storyboard-model";
import {requireVoice} from "../catalog";
import "server-only";
import type { Db, ClientSession } from "mongodb";
import { projectDTO, type Project } from "./model";
import { jobDTO, type IdeaJob } from "./ideas-model";
export async function projectView(db: Db, project: Project, session?: ClientSession) {
 const job=project.activeJobId?await db.collection<IdeaJob>("generationJobs").findOne({_id:project.activeJobId,ownerId:project.ownerId,projectId:project._id},{session}):null;
 const story=project.activeStoryboardId?await db.collection<Storyboard>("storyboards").findOne({_id:project.activeStoryboardId,ownerId:project.ownerId,projectId:project._id},{session}):null;
 const hash=story?.compileState==="VALID"?snapshotHash(story,project.settings):null;
 let approval=project.approval?.snapshotHash===hash?project.approval:null;
 if(approval)try{requireVoice(project.settings.voiceKey);}catch{approval=null;}
 return projectDTO({...project,currentSnapshotHash:hash,approval,statusProjection:{...project.statusProjection,creationStatus:project.statusProjection.creationStatus==="STORYBOARD_APPROVED"&&!approval?"STORYBOARD_REVIEW":project.statusProjection.creationStatus}},job?jobDTO(job):null);
}
