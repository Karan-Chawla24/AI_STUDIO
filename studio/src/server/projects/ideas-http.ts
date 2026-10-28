import {approvalCommand,revisionInput} from "./approval";
import {editStoryboard} from "./scene-service";
import {regenerateInput} from "./scene-model";
import { storyboardInput, storyboardDTO, type Storyboard, type PlanningProposal } from "./storyboard-model";
import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type { Filter } from "mongodb";
import { getIdentity } from "../auth/service";
import { readAuthConfig } from "../auth/config";
import { getDatabase, type DatabaseConnection } from "../db/client";
import { strictJSON, validCsrf, projectFailure } from "./http";
import { ProjectError, projectIdPattern } from "./model";
import { readProject } from "./service";
import { ideaInput, jobDTO, proposalDTO, type IdeaJob, } from "./ideas-model";
import { admitIdeas, decideProposal, cancelIdea, ownedResource } from "./ideas";
import { cursorKeys } from "./library";
export async function ideaList(c:DatabaseConnection,owner:string,projectId:string,kind:"jobs"|"proposals"|"storyboards",params:URLSearchParams,secret:string) {
 await readProject(c,owner,projectId);
 const states=kind==="jobs"?["QUEUED","RUNNING","SUCCEEDED","FAILED","CANCELLED","SUPERSEDED","REQUIRES_ATTENTION"]:["PENDING","APPLIED","DISMISSED","CONFLICTED"];
 const kinds=kind==="jobs"?["IDEA_BRAINSTORM","IDEA_REFINE","STORYBOARD_GENERATE","SCENE_REGENERATE","STORYBOARD_COMPILE"]:["IDEAS","STORYBOARD","SCENE","COMPILE"];
 const invalid=():never=>{throw new ProjectError("INVALID_QUERY","Check the list filters or refresh the list.",400);};
 for(const k of params.keys()) if(!(kind==="storyboards"?["limit","cursor"]:["limit","cursor","state","kind"]).includes(k)||params.getAll(k).length!==1)invalid();
 const limit=params.get("limit")??"20",state=params.get("state"),type=params.get("kind");
 if(!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit)||(state&&!states.includes(state))||(type&&!kinds.includes(type)))invalid();
 const keys=cursorKeys(secret),mac=(key:string,data:string)=>createHmac("sha256",key).update(`ideas-list:${data}`).digest("base64url");
 const binding=JSON.stringify([owner,projectId,kind,limit,state,type]); let asOf=Date.now(),last:string|null=null;
 const cursor=params.get("cursor");
 if(cursor){
  if(cursor.length>3000)invalid();const [body,sig,extra]=cursor.split(".");if(extra||!body||!sig||!/^[A-Za-z0-9_-]{43}$/.test(sig))invalid();
  if(![keys.current,keys.previous].some(k=>k&&timingSafeEqual(Buffer.from(sig),Buffer.from(mac(k,body)))))invalid();
  try {const parsed=JSON.parse(Buffer.from(body,"base64url").toString());if(parsed.binding!==binding||!Number.isSafeInteger(parsed.asOf)||parsed.asOf>Date.now()||!projectIdPattern.test(parsed.last))invalid();if(parsed.asOf+1800000<=Date.now())throw new ProjectError("CURSOR_EXPIRED","Refresh the list to continue.",400);asOf=parsed.asOf;last=parsed.last;}catch(e){if(e instanceof ProjectError)throw e;invalid();}
 }
 const filter:Filter<IdeaJob|PlanningProposal|Storyboard>={ownerId:owner,projectId,createdAt:{$lte:new Date(asOf)}}; if(state)filter.state=state as IdeaJob["state"];if(type)filter.kind=type as IdeaJob["kind"];
 // UUIDv7 IDs preserve admission order; the timestamp and ID are both bound by the signed cursor.
 if(last){const row=await c.db.collection<IdeaJob|PlanningProposal|Storyboard>(kind==="jobs"?"generationJobs":kind).findOne({_id:last,ownerId:owner,projectId});if(!row)invalid();filter.$or=[{createdAt:{$lt:row!.createdAt}},{createdAt:row!.createdAt,_id:{$lt:last}}];}
 const rows=await c.db.collection<IdeaJob|PlanningProposal|Storyboard>(kind==="jobs"?"generationJobs":kind).find(filter,{maxTimeMS:5000}).sort({createdAt:-1,_id:-1}).limit(Number(limit)+1).toArray(),hasMore=rows.length>Number(limit),items=rows.slice(0,Number(limit));
 const payload=Buffer.from(JSON.stringify({binding,asOf,last:items.at(-1)?._id})).toString("base64url");
 return {items:items.map(r=>kind==="jobs"?jobDTO(r as IdeaJob):kind==="storyboards"?{id:r._id,version:(r as Storyboard).version,title:(r as Storyboard).title,compileState:(r as Storyboard).compileState,createdAt:r.createdAt.toISOString()}:proposalDTO(r as PlanningProposal)),page:{hasMore,nextCursor:hasMore?`${payload}.${mac(keys.current,payload)}`:null,limit:Number(limit)}};
}
export async function ideasRequest(request:Request,projectId:string,parts:string[],deps:{connection:DatabaseConnection;identity:Awaited<ReturnType<typeof getIdentity>>;config:ReturnType<typeof readAuthConfig>}) {
 const requestId=randomUUID(),headers=new Headers({"X-Request-Id":requestId,"Cache-Control":"private, no-store",Vary:"Cookie"});
 try {
  const {identity,connection:c,config}=deps;if(!identity)throw new ProjectError("AUTH_REQUIRED","Please sign in.",401);
  const [section,id,action]=parts,owner=identity.user.id,url=new URL(request.url);
  if(request.method==="GET"&&["jobs","proposals","storyboards"].includes(section)&&parts.length<=2){
   if(!id)return Response.json({data:await ideaList(c,owner,projectId,section as "jobs"|"proposals"|"storyboards",url.searchParams,config.secret),requestId},{headers});
   if(url.search)throw new ProjectError("INVALID_QUERY","This endpoint accepts no query parameters.",400);
   const row=await ownedResource(c,owner,projectId,id,section as "jobs"|"proposals"|"storyboards");
   const tag=`"${section}-${row._id}-${section==="jobs"?(row as IdeaJob).resourceVersion:(row as PlanningProposal).version}"`;headers.set("ETag",tag);headers.set("Cache-Control","private, no-cache");if(request.headers.get("if-none-match")===tag)return new Response(null,{status:304,headers});
   return Response.json({data:section==="jobs"?jobDTO(row as IdeaJob):section==="storyboards"?storyboardDTO(row as Storyboard):proposalDTO(row as PlanningProposal),requestId},{headers});
  }
  if(!["POST","PATCH","DELETE"].includes(request.method)||url.search)throw new ProjectError("METHOD_NOT_ALLOWED","This action is unavailable.",405);
  if(request.headers.get("origin")!==config.origin||request.headers.get("sec-fetch-site")==="cross-site"||!validCsrf(request.headers.get("x-csrf-token"),identity,config.secret))throw new ProjectError("CSRF_FAILED","Refresh your session and try again.",403);
  const key=request.headers.get("idempotency-key");if(!key)throw new ProjectError("PRECONDITION_REQUIRED","An Idempotency-Key is required.",428);if(!/^[\x20-\x7e]{16,128}$/.test(key))throw new ProjectError("VALIDATION_FAILED","Use a valid retry key.",422);
  const body=await strictJSON(request);let result;
  if(parts.length===1&&((section==="approval"&&["POST","DELETE"].includes(request.method))||(section==="settings"&&request.method==="PATCH")))result=await approvalCommand(c,owner,projectId,section==="settings"?"voice":request.method==="DELETE"?"revoke":"approve",body,key,identity.user.emailVerified,requestId);
  else if(request.method==="DELETE")throw new ProjectError("METHOD_NOT_ALLOWED","This action is unavailable.",405);
  else if(section==="storyboards"&&id==="compile"&&parts.length===2&&request.method==="POST"){const d=revisionInput(body);result=await admitIdeas(c,owner,projectId,"STORYBOARD_COMPILE",{expectedRevision:Number(d.expectedRevision),guidance:"",count:8},key,identity.user.emailVerified);}
  else if(request.method==="PATCH"){if(!((section==="storyboard"&&parts.length===1)||(section==="scenes"&&parts.length===2)))throw new ProjectError("METHOD_NOT_ALLOWED","This action is unavailable.",405);result=await editStoryboard(c,owner,projectId,section==="scenes"?id:null,body,key,requestId);}
  else if(section==="scenes"&&parts.length===3&&action==="regenerate")result=await admitIdeas(c,owner,projectId,"SCENE_REGENERATE",regenerateInput(body,id),key,identity.user.emailVerified);
  else if(section==="ideas"&&parts.length===2&&["brainstorm","refine"].includes(id))result=await admitIdeas(c,owner,projectId,id==="refine"?"IDEA_REFINE":"IDEA_BRAINSTORM",ideaInput(body,id==="refine"),key,identity.user.emailVerified);
  else if(section==="storyboards"&&parts.length===2&&id==="generate")result=await admitIdeas(c,owner,projectId,"STORYBOARD_GENERATE",storyboardInput(body),key,identity.user.emailVerified);
  else {
   const d=body as {expectedVersion:number;expectedRevision?:number;selectedIdeaId?:string};const apply=section==="proposals"&&action==="apply";
   if(!d||typeof d!=="object"||Array.isArray(d)||Object.keys(d).some(k=>!["expectedVersion",...(apply?["expectedRevision","selectedIdeaId"]:[])].includes(k))||!Number.isSafeInteger(d.expectedVersion)||d.expectedVersion<1||(apply&&(!Number.isSafeInteger(d.expectedRevision)||Number(d.expectedRevision)<1||(d.selectedIdeaId!==undefined&&typeof d.selectedIdeaId!=="string"))))throw new ProjectError("VALIDATION_FAILED","Review the saved version and selection.",422);
   if(section==="proposals"&&parts.length===3&&["apply","dismiss"].includes(action))result=await decideProposal(c,owner,projectId,id,action as "apply"|"dismiss",d,key,requestId);
   else if(section==="jobs"&&parts.length===3&&action==="cancel")result=await cancelIdea(c,owner,projectId,id,d.expectedVersion,key);
   else throw new ProjectError("RESOURCE_NOT_FOUND","This action does not exist.",404);
  }
  if(result.replayed)headers.set("Idempotent-Replay","true");if(result.status===202&&result.data.statusUrl){headers.set("Location",String(result.data.statusUrl));headers.set("Retry-After","3");}
  if(result.status===409)return projectFailure(new ProjectError(String(result.data.code),String(result.data.message),409,[],{currentRevision:result.data.currentRevision}),requestId,headers);
  return Response.json({data:result.data,requestId},{status:result.status,headers});
 }catch(e){return projectFailure(e,requestId,headers);}
}
export async function ideasRoute(request:Request,projectId:string,parts:string[]){try{return await ideasRequest(request,projectId,parts,{connection:await getDatabase(),identity:await getIdentity(request.headers),config:readAuthConfig()});}catch(e){return projectFailure(e);}}
