import "server-only";
import {createHash} from "node:crypto";
import {ProjectError,uuid7} from "./model";
import type {IdeaJob,Proposal} from "./ideas-model";
export const sceneTypes = ["TITLE","PROCESS_FLOW","DIAGRAM","GENERIC_EDITORIAL"] as const;
export type Scene = {sceneId:string;order:number;narration:string;speechText:string;speechMode:"AUTO";visualDescription:string;motionDescription:string;sceneType:typeof sceneTypes[number];estimatedDurationSeconds:number;captionHighlights:string[];compiled:null;validationErrors:[]};
export type Storyboard = {_id:string;schemaVersion:1;ownerId:string;projectId:string;createdAt:Date;version:number;baseRevision:number;title:string;hook:string;targetDurationSeconds:number;visualStyle:"minimal_editorial";compileState:"NEEDS_COMPILATION";contentHash:string;scenes:Scene[];warnings:[];compilerVersion:null;templateCatalogVersion:"visual-v1";normalizerVersion:"speech-pass-through-v1";sourceProposalId:string;sourceJobId:string};
export function storyboardDTO(s:Storyboard) {return {id:s._id,projectId:s.projectId,version:s.version,baseRevision:s.baseRevision,title:s.title,hook:s.hook,targetDurationSeconds:s.targetDurationSeconds,visualStyle:s.visualStyle,compileState:s.compileState,contentHash:s.contentHash,scenes:s.scenes.map(({compiled,...scene})=>({...scene,compiledPreview:compiled})),warnings:s.warnings,createdAt:s.createdAt.toISOString()};}
export type StoryboardDTO=ReturnType<typeof storyboardDTO>;
export type StoryboardProposal=Omit<Proposal,"kind"|"payload"|"appliedStoryboardId">&{kind:"STORYBOARD";payload:{storyboard:StoryboardDTO};appliedStoryboardId:string|null};
export type PlanningProposal=Proposal|StoryboardProposal;
export type StoryboardInput={expectedRevision:number;guidance:string;replaceExistingConfirmed:boolean};
export function storyboardInput(value:unknown):StoryboardInput {
 const d=value as Record<string,unknown>;
 if(!d||typeof d!=="object"||Array.isArray(d))throw new ProjectError("VALIDATION_FAILED","Use a storyboard request object.",422);
 if(d.expectedRevision===undefined)throw new ProjectError("PRECONDITION_REQUIRED","Save your plan first.",428);
 if(Object.keys(d).some(k=>!["expectedRevision","guidance","replaceExistingConfirmed"].includes(k))||!Number.isSafeInteger(d.expectedRevision)||Number(d.expectedRevision)<1||(d.guidance!==undefined&&typeof d.guidance!=="string")||(d.replaceExistingConfirmed!==undefined&&typeof d.replaceExistingConfirmed!=="boolean"))throw new ProjectError("VALIDATION_FAILED","Check the storyboard request.",422);
 const guidance=String(d.guidance??"").normalize("NFC").trim();if(guidance.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(guidance))throw new ProjectError("VALIDATION_FAILED","Use guidance up to 1,000 characters.",422);
 return {expectedRevision:Number(d.expectedRevision),guidance,replaceExistingConfirmed:d.replaceExistingConfirmed===true};
}
function canonical(value:unknown):string {if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b,"en")).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;return JSON.stringify(value);}
export function storyboardHash(content:{title:string;hook:string;targetDurationSeconds:number;scenes:Scene[]}) {
 return createHash("sha256").update(canonical({schema:"storyboard-content-v1",title:content.title,hook:content.hook,targetDurationSeconds:content.targetDurationSeconds,visualStyle:"minimal_editorial",scenes:content.scenes.map(({sceneId,...scene})=>{void sceneId;return scene;})})).digest("hex");
}
export function validateStoryboard(value:unknown) {
 const fail=():never=>{throw new ProjectError("INVALID_PROVIDER_OUTPUT","The storyboard response did not meet the scene requirements. Your saved work is unchanged.",502);};
 const object=(x:unknown,keys:string[])=>{if(!x||typeof x!=="object"||Array.isArray(x)||Object.keys(x).sort().join()!==keys.sort().join())return fail();return x as Record<string,unknown>;};
 const text=(x:unknown,max:number)=>{if(typeof x!=="string")return fail();const v=x.normalize("NFC").trim();if(!v||[...v].length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))return fail();return v;};
 const root=object(value,["title","hook","scenes"]);if(!Array.isArray(root.scenes)||root.scenes.length<6||root.scenes.length>12)return fail();
 const scenes:Scene[]=root.scenes.map((item,order)=>{
  const row=object(item,["narration","visualDescription","motionDescription","sceneType","captionHighlights"]),narration=text(row.narration,1200);
  if(!sceneTypes.includes(row.sceneType as Scene["sceneType"])||!Array.isArray(row.captionHighlights)||row.captionHighlights.length>12)return fail();
  const captionHighlights=row.captionHighlights.map(h=>text(h,60));if(captionHighlights.some(h=>!narration.toLocaleLowerCase("en").includes(h.toLocaleLowerCase("en"))))return fail();
  const speechText=narration.replace(/\s+/g," ");
  return {sceneId:uuid7(),order,narration,speechText,speechMode:"AUTO",visualDescription:text(row.visualDescription,2000),motionDescription:text(row.motionDescription,2000),sceneType:row.sceneType as Scene["sceneType"],estimatedDurationSeconds:Math.max(1,Math.round(speechText.split(/\s+/).length/2.5*10)/10),captionHighlights,compiled:null,validationErrors:[]};
 });
 if(scenes.reduce((sum,s)=>sum+[...s.narration].length,0)>12000)return fail();
 return {title:text(root.title,120),hook:text(root.hook,500),scenes};
}
export function proposedStoryboard(content:ReturnType<typeof validateStoryboard>,job:IdeaJob,proposalId:string,version:number):StoryboardDTO {
 const targetDurationSeconds=job.input!.duration;
 return storyboardDTO({_id:uuid7(),schemaVersion:1,ownerId:job.ownerId,projectId:job.projectId,createdAt:new Date(),version,baseRevision:job.baseRevision,...content,targetDurationSeconds,visualStyle:"minimal_editorial",compileState:"NEEDS_COMPILATION",contentHash:storyboardHash({...content,targetDurationSeconds}),warnings:[],compilerVersion:null,templateCatalogVersion:"visual-v1",normalizerVersion:"speech-pass-through-v1",sourceProposalId:proposalId,sourceJobId:job._id});
}
export function snapshotFromProposal(p:StoryboardProposal,version:number):Storyboard {
 const s=p.payload.storyboard;
 return {_id:s.id,schemaVersion:1,ownerId:p.ownerId,projectId:p.projectId,createdAt:new Date(),version,baseRevision:p.baseRevision,title:s.title,hook:s.hook,targetDurationSeconds:s.targetDurationSeconds,visualStyle:s.visualStyle,compileState:"NEEDS_COMPILATION",contentHash:s.contentHash,scenes:s.scenes.map(({compiledPreview,...scene})=>{void compiledPreview;return {...scene,compiled:null};}),warnings:[],compilerVersion:null,templateCatalogVersion:"visual-v1",normalizerVersion:"speech-pass-through-v1",sourceProposalId:p._id,sourceJobId:p.sourceJobId};
}
