import "server-only";
import type {Document} from "mongodb";
import type {DatabaseConnection} from "../db/client";
import {ideaCommand} from "./ideas";
import {requireCompileMigration} from "./compile-schema";
import {snapshotHash} from "./compiler";
import {ProjectError,projectDTO,uuid7,type Project} from "./model";
import type {Storyboard} from "./storyboard-model";
export function revisionInput(value:unknown,fields:string[]=[]){
 const d=value as Record<string,unknown>;
 if(!d||typeof d!=="object"||Array.isArray(d)||Object.keys(d).some(k=>!["expectedRevision",...fields].includes(k))||!Number.isSafeInteger(d.expectedRevision)||Number(d.expectedRevision)<1)throw new ProjectError("VALIDATION_FAILED","Use the current saved revision and supported fields.",422);
 return d;
}
export async function approvalCommand(c:DatabaseConnection,owner:string,projectId:string,action:"approve"|"revoke"|"voice",value:unknown,key:string,verified:boolean,requestId:string){
 const d=revisionInput(value,action==="approve"?["storyboardId","snapshotHash"]:action==="voice"?["voiceKey"]:[]);
 if(action==="approve"&&!verified)throw new ProjectError("EMAIL_NOT_VERIFIED","Verify your email before approving.",403);
 if(action==="voice"&&!["INDIAN_MALE","INDIAN_FEMALE"].includes(String(d.voiceKey)))throw new ProjectError("VALIDATION_FAILED","Choose an available voice preset.",422);
 await requireCompileMigration(c.db);
 return ideaCommand(c,owner,projectId,`/api/v1/projects/${projectId}/${action==="voice"?"settings":"approval"}`,key,d,async(p,session)=>{
  if(p.revision!==d.expectedRevision)throw new ProjectError("REVISION_CONFLICT","Your project changed. Refresh before continuing.",409);
  if(action!=="revoke"&&p.activeJobId)throw new ProjectError("PROJECT_BUSY","Wait for the active request before continuing.",409);
  const story=await c.db.collection<Storyboard>("storyboards").findOne({_id:p.activeStoryboardId??"",ownerId:owner,projectId},{session});
  const now=new Date(),settings={...p.settings,...(action==="voice"?{voiceKey:d.voiceKey as Project["settings"]["voiceKey"]}:{})};
  const hash=story?.compileState==="VALID"?snapshotHash(story,settings):null;
  if(action==="approve"&&(!story||!hash||story.scenes.some(s=>!s.compiled||s.validationErrors.length)||!settings.voiceKey||d.storyboardId!==story._id||d.snapshotHash!==hash||p.currentSnapshotHash!==hash))throw new ProjectError("APPROVAL_NOT_READY","Compile the current storyboard, select a voice and review the latest snapshot before approving.",409);
  if(action==="voice"&&p.settings.voiceKey===settings.voiceKey)return {data:{project:projectDTO(p)},status:200,operationId:p._id};
  const approval=action==="approve"?{storyboardId:story!._id,snapshotHash:hash!,approvedBy:owner,approvedAt:now}:null;
  const saved=await c.db.collection<Project>("projects").findOneAndUpdate({_id:p._id,resourceVersion:p.resourceVersion},{$set:{settings,approval,currentSnapshotHash:hash,updatedAt:now,"statusProjection.creationStatus":approval?"STORYBOARD_APPROVED":p.activeJobId?p.statusProjection.creationStatus:story?"STORYBOARD_REVIEW":"DRAFT","statusProjection.computedAt":now},$inc:{resourceVersion:1,revision:action==="voice"?1:0,"publishFence.epoch":1}},{session,returnDocument:"after"});
  if(!saved)throw new ProjectError("REVISION_CONFLICT","Refresh before continuing.",409);
  await c.db.collection("auditEvents").insertOne({_id:uuid7(),schemaVersion:1,createdAt:now,ownerId:owner,actorType:"USER",actorId:owner,action:action==="approve"?"STORYBOARD_APPROVED":action==="revoke"?"STORYBOARD_UNAPPROVED":"VOICE_SELECTED",aggregateType:"PROJECT",aggregateId:projectId,requestId,jobId:null,details:{storyboardId:story?._id??"none",snapshotHash:hash},expiresAt:new Date(now.getTime()+90*86400000)} as Document,{session});
  return {data:{project:projectDTO(saved)},status:200,operationId:p._id};
 },action==="voice"?"PATCH":action==="revoke"?"DELETE":"POST");
}
