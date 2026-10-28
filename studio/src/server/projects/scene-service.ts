import "server-only";
import type {Document} from "mongodb";
import type {DatabaseConnection} from "../db/client";
import {ideaCommand} from "./ideas";
import {requireSceneMigration} from "./scene-schema";
import {boundedText,editObject,editableSceneFields,patchScene} from "./scene-model";
import {storyboardDTO,storyboardHash,type Storyboard} from "./storyboard-model";
import {ProjectError,uuid7,projectDTO,type Project} from "./model";
import {missingProject} from "./service";
export async function editStoryboard(c:DatabaseConnection,owner:string,projectId:string,sceneId:string|null,input:unknown,key:string,requestId:string){
 const patch=editObject(input,sceneId?editableSceneFields:["title","hook"]);await requireSceneMigration(c.db);
 const route=`/api/v1/projects/${projectId}/${sceneId?`scenes/${sceneId}`:"storyboard"}`;
 return ideaCommand(c,owner,projectId,route,key,patch,async(p,session)=>{
  if(p.revision!==patch.expectedRevision)throw new ProjectError("REVISION_CONFLICT","The storyboard changed. Your edits are kept; review the latest version before saving.",409);
  const before=await c.db.collection<Storyboard>("storyboards").findOne({_id:p.activeStoryboardId??"",ownerId:owner,projectId},{session});if(!before)throw missingProject();
  const next=structuredClone(before);
  if(sceneId){const index=next.scenes.findIndex(s=>s.sceneId===sceneId);if(index<0)throw missingProject();next.scenes[index]=patchScene(next.scenes[index],patch);}
  else {if(patch.title!==undefined)next.title=boundedText(patch.title,120);if(patch.hook!==undefined)next.hook=boundedText(patch.hook,500);}
  if(next.scenes.reduce((n,s)=>n+[...s.narration].length,0)>12000)throw new ProjectError("VALIDATION_FAILED","Use at most 12,000 narration characters across scenes.",422);
  next.contentHash=storyboardHash(next);
  if(next.contentHash===before.contentHash)return {data:{project:projectDTO(p),storyboard:storyboardDTO(before)},status:200,operationId:before._id};
  const now=new Date();Object.assign(next,{_id:uuid7(),createdAt:now,version:p.nextStoryboardVersion,baseRevision:p.revision,sourceProposalId:null,sourceJobId:null,compileState:"NEEDS_COMPILATION"});
  await c.db.collection<Storyboard>("storyboards").insertOne(next,{session});
  const saved=await c.db.collection<Project>("projects").findOneAndUpdate({_id:projectId,resourceVersion:p.resourceVersion,lifecycle:"ACTIVE"},{$set:{activeStoryboardId:next._id,approval:null,currentSnapshotHash:null,updatedAt:now},$inc:{revision:1,resourceVersion:1,nextStoryboardVersion:1,"publishFence.epoch":1}},{session,returnDocument:"after"});if(!saved)throw new ProjectError("REVISION_CONFLICT","Refresh the storyboard.",409);
  await c.db.collection("auditEvents").insertOne({_id:uuid7(),schemaVersion:1,createdAt:now,ownerId:owner,actorType:"USER",actorId:owner,action:"STORYBOARD_EDITED",aggregateType:"PROJECT",aggregateId:projectId,requestId,jobId:null,details:{storyboardId:next._id,fromRevision:p.revision,toRevision:saved.revision},expiresAt:new Date(now.getTime()+90*86400000)} as Document,{session});
  return {data:{project:projectDTO(saved),storyboard:storyboardDTO(next)},status:200,operationId:next._id};
 },"PATCH");
}
