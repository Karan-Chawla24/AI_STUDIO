import "server-only";
import {isDeepStrictEqual} from "node:util";
import type {Document} from "mongodb";
import type {DatabaseConnection} from "../db/client";
import {requireVoice} from "../catalog";
import {captionStyles,voiceKeys} from "@/shared/catalog";
import {ideaCommand} from "./ideas";
import {revisionInput} from "./approval";
import {requireSettingsMigration} from "./settings-schema";
import {snapshotHash} from "./compiler";
import {ProjectError,projectDTO,uuid7,type Project,planChangedWarning} from "./model";
import type {Storyboard} from "./storyboard-model";
export function settingsInput(value:unknown){
 const fields=["voiceKey","captionStyle","musicAssetId","targetDurationSeconds"],d=revisionInput(value,fields);
 const bad=()=>{throw new ProjectError("VALIDATION_FAILED","Choose an available voice, a supported caption style, no music and a duration from 60 to 90 seconds.",422);};
 if(!fields.some(k=>Object.hasOwn(d,k)))bad();
 if(Object.hasOwn(d,"voiceKey")&&!voiceKeys.includes(d.voiceKey as never))bad();
 if(Object.hasOwn(d,"captionStyle")&&!captionStyles.includes(d.captionStyle as never))bad();
 if(Object.hasOwn(d,"musicAssetId")&&d.musicAssetId!==null)bad();
 if(Object.hasOwn(d,"targetDurationSeconds")&&(!Number.isInteger(d.targetDurationSeconds)||Number(d.targetDurationSeconds)<60||Number(d.targetDurationSeconds)>90))bad();
 const {expectedRevision,...patch}=d;return {expectedRevision:Number(expectedRevision),patch:patch as Partial<Project["settings"]>};
}
export async function updateSettings(c:DatabaseConnection,owner:string,id:string,value:unknown,key:string,requestId:string){
 const {expectedRevision,patch}=settingsInput(value);await requireSettingsMigration(c.db);
 return ideaCommand(c,owner,id,`/api/v1/projects/${id}/settings`,key,value,async(p,session)=>{
  if(p.revision!==expectedRevision)throw new ProjectError("REVISION_CONFLICT","Settings changed. Refresh the project before saving again.",409);
  if(p.activeJobId)throw new ProjectError("PROJECT_BUSY","Wait for the active request before changing settings.",409);
  if(patch.voiceKey)requireVoice(patch.voiceKey);
  const settings={...p.settings,...patch};
  const story=await c.db.collection<Storyboard>("storyboards").findOne({_id:p.activeStoryboardId??"",ownerId:owner,projectId:id},{session});
  const hash=story?.compileState==="VALID"?snapshotHash(story,settings):null;
  if(isDeepStrictEqual(p.settings,settings)&&p.currentSnapshotHash===hash)return {data:{project:projectDTO(p)},status:200,operationId:p._id};
  const now=new Date();const saved=await c.db.collection<Project>("projects").findOneAndUpdate({_id:p._id,resourceVersion:p.resourceVersion},{$set:{settings,approval:null,currentSnapshotHash:hash,updatedAt:now,warnings:story&&settings.targetDurationSeconds!==p.settings.targetDurationSeconds?planChangedWarning:p.warnings,"statusProjection.creationStatus":story?"STORYBOARD_REVIEW":"DRAFT","statusProjection.computedAt":now},$inc:{revision:1,resourceVersion:1,"publishFence.epoch":1}},{session,returnDocument:"after"});
  if(!saved)throw new ProjectError("REVISION_CONFLICT","Refresh the project before saving settings.",409);
  await c.db.collection("auditEvents").insertOne({_id:uuid7(),schemaVersion:1,createdAt:now,ownerId:owner,actorType:"USER",actorId:owner,action:"PROJECT_SETTINGS_UPDATED",aggregateType:"PROJECT",aggregateId:id,requestId,jobId:null,details:{storyboardId:story?._id??"none",snapshotHash:hash},expiresAt:new Date(now.getTime()+90*86400000)} as Document,{session});
  return {data:{project:projectDTO(saved)},status:200,operationId:p._id};
 },"PATCH");
}
