import "server-only";
import { createHash } from "node:crypto";
import type { ClientSession, Document } from "mongodb";
import { inTransaction, type DatabaseConnection } from "../db/client";
import type { UserProfile } from "../auth/profile";
import { ProjectError, uuid7, projectDTO, type Project } from "./model";
import { missingProject, readProject } from "./service";
import { verifyIdeas } from "./ideas-schema";
import { ideaConfig, generateIdeas } from "./ideas-provider";
import { validateIdeas, proposalDTO, jobDTO, type IdeaJob, type IdeaInput, type Proposal } from "./ideas-model";
export const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
type Receipt = Document & { _id: string; requestHash: string; responseBody: Document; responseStatus: number; expiresAt: Date | null };
export async function ideaCommand(c: DatabaseConnection, owner: string, projectId: string, route: string, key: string, input: unknown, run: (p: Project, session: ClientSession) => Promise<{data: Document; status: number; operationId: string; pending?: boolean}>) {
 await verifyIdeas(c.db); const scope = {ownerId:owner,method:"POST",routeKey:route,keyHash:digest(key)}, hash = digest(input), receiptId=uuid7();
 return inTransaction(c.client,async session => {
  if (!await c.db.collection<UserProfile>("userProfiles").findOneAndUpdate({_id:owner,lifecycle:"ACTIVE"},{$inc:{fenceVersion:1}},{session})) throw new ProjectError("ACCOUNT_DELETING","This account cannot change projects.",403);
  const p = await c.db.collection<Project>("projects").findOne({_id:projectId,ownerId:owner,lifecycle:"ACTIVE"},{session}); if (!p) throw missingProject();
  const receipts = c.db.collection<Receipt>("idempotencyRecords"), old = await receipts.findOne(scope,{session});
  if (old && (!old.expiresAt || old.expiresAt > new Date())) { if(old.requestHash !== hash) throw new ProjectError("IDEMPOTENCY_CONFLICT","This retry key belongs to different details.",409); return {data:old.responseBody,status:old.responseStatus,replayed:true}; }
  if (old) await receipts.deleteOne({_id:old._id},{session});
  const r = await run(p,session), now=new Date();
  await receipts.insertOne({_id:receiptId,schemaVersion:1,createdAt:now,...scope,requestHash:hash,operationId:r.operationId,responseBody:r.data,responseStatus:r.status,state:r.pending?"ACCEPTED":"TERMINAL",terminalAt:r.pending?null:now,expiresAt:r.pending?null:new Date(now.getTime()+7*86400000)},{session});
  return {data:r.data,status:r.status,replayed:false};
 });
}
export async function admitIdeas(c:DatabaseConnection,owner:string,projectId:string,kind:IdeaJob["kind"],input:IdeaInput,key:string,verified:boolean,model?:string) {
 if(!verified) throw new ProjectError("EMAIL_NOT_VERIFIED","Verify your email before generating ideas.",403);
 const jobId=uuid7(), now=new Date(), route=`/api/v1/projects/${projectId}/ideas/${kind === "IDEA_REFINE" ? "refine":"brainstorm"}`;
 return ideaCommand(c,owner,projectId,route,key,input,async(p,session)=>{
  const configuredModel = model ?? ideaConfig().model;
  if(p.revision !== input.expectedRevision) throw new ProjectError("REVISION_CONFLICT","Your plan changed. Refresh it before generating.",409);
  if(p.activeJobId) throw new ProjectError("PROJECT_BUSY","This project already has an active job. Review its status first.",409);
  if(await c.db.collection<IdeaJob>("generationJobs").countDocuments({ownerId:owner,createdAt:{$gt:new Date(Date.now()-3600000)}},{session}) >=20) throw new ProjectError("RATE_LIMITED","You have reached twenty planning requests this hour. Try later.",429);
  const snapshot={title:p.title,idea:p.refinedIdea??p.originalIdea,audience:p.audience,niche:p.niche,duration:p.settings.targetDurationSeconds,count:input.count,guidance:input.guidance,model:configuredModel};
  const job:IdeaJob={_id:jobId,schemaVersion:1,ownerId:owner,projectId,createdAt:now,updatedAt:now,resourceVersion:1,kind,state:"QUEUED",active:true,stage:"QUEUED",baseRevision:p.revision,input:snapshot,inputHash:digest(snapshot),proposalIds:[],cancelRequested:false,lease:{holder:null,epoch:0,expiresAt:null},startedAt:null,finishedAt:null,error:null,unsafeToRetry:false};
  await c.db.collection<IdeaJob>("generationJobs").insertOne(job,{session});
  await c.db.collection<Project>("projects").updateOne({_id:projectId,resourceVersion:p.resourceVersion},{$set:{activeJobId:jobId,updatedAt:now,"statusProjection.creationStatus":"PLANNING","statusProjection.computedAt":now},$inc:{resourceVersion:1}},{session});
  return {data:{operationId:jobId,jobId,state:"QUEUED",statusUrl:`/api/v1/projects/${projectId}/jobs/${jobId}`,pollAfterMs:3000},status:202,operationId:jobId,pending:true};
 });
}
export async function decideProposal(c:DatabaseConnection,owner:string,projectId:string,id:string,action:"apply"|"dismiss",input:{expectedVersion:number;expectedRevision?:number;selectedIdeaId?:string},key:string,requestId:string) {
 const auditId=uuid7();
 return ideaCommand(c,owner,projectId,`/api/v1/projects/${projectId}/proposals/${id}/${action}`,key,input,async(p,session)=>{
  const collection=c.db.collection<Proposal>("proposals"), proposal=await collection.findOne({_id:id,ownerId:owner,projectId},{session}); if(!proposal) throw missingProject();
  if(proposal.version !== input.expectedVersion) throw new ProjectError("VERSION_CONFLICT","This suggestion changed. Refresh it before continuing.",409);
  if(!["PENDING","CONFLICTED"].includes(proposal.state)) throw new ProjectError("PROPOSAL_NOT_PENDING","This suggestion was already reviewed.",409);
  const now=new Date();
  if(action === "dismiss") { const updated=await collection.findOneAndUpdate({_id:id,version:input.expectedVersion},{$set:{state:"DISMISSED",updatedAt:now},$inc:{version:1}},{session,returnDocument:"after"}); return {data:proposalDTO(updated!),status:200,operationId:id}; }
  if(p.activeJobId) throw new ProjectError("PROJECT_BUSY","Wait for the current idea job before applying a suggestion.",409);
  if(p.revision !== input.expectedRevision || proposal.baseRevision !== p.revision || proposal.state === "CONFLICTED") {
   if(proposal.state !== "CONFLICTED") await collection.updateOne({_id:id},{$set:{state:"CONFLICTED",updatedAt:now},$inc:{version:1}},{session});
   return {data:{code:"PROPOSAL_STALE",message:"This suggestion belongs to an older plan. Generate a new one or copy the text into your plan.",currentRevision:p.revision},status:409,operationId:id};
  }
  const idea=proposal.payload.ideas.find(i=>i.id===input.selectedIdeaId); if(!idea) throw new ProjectError("VALIDATION_FAILED","Select an idea from this suggestion.",422);
  const saved=await c.db.collection<Project>("projects").findOneAndUpdate({_id:projectId,resourceVersion:p.resourceVersion,lifecycle:"ACTIVE"},{$set:{refinedIdea:idea.refinedIdea,updatedAt:now},$inc:{revision:1,resourceVersion:1,"publishFence.epoch":1}},{session,returnDocument:"after"}); if(!saved) throw new ProjectError("REVISION_CONFLICT","The plan changed. Refresh before continuing.",409);
  const updated=await collection.findOneAndUpdate({_id:id,version:input.expectedVersion},{$set:{state:"APPLIED",appliedAt:now,updatedAt:now},$inc:{version:1}},{session,returnDocument:"after"});
  await c.db.collection("auditEvents").insertOne({_id:auditId,schemaVersion:1,createdAt:now,ownerId:owner,actorType:"USER",actorId:owner,action:"PROJECT_PLAN_UPDATED",aggregateType:"PROJECT",aggregateId:projectId,requestId,jobId:null,details:{changedFields:["refinedIdea"],fromRevision:p.revision,toRevision:saved.revision},expiresAt:new Date(now.getTime()+90*86400000)} as Document,{session});
  return {data:{project:projectDTO(saved),storyboard:null,proposal:proposalDTO(updated!)},status:200,operationId:id};
 });
}
export async function cancelIdea(c:DatabaseConnection,owner:string,projectId:string,id:string,version:number,key:string) {
 return ideaCommand(c,owner,projectId,`/api/v1/projects/${projectId}/jobs/${id}/cancel`,key,{expectedVersion:version},async(p,session)=>{
  const job=await c.db.collection<IdeaJob>("generationJobs").findOne({_id:id,ownerId:owner,projectId},{session}); if(!job) throw missingProject();
  if(job.resourceVersion!==version) throw new ProjectError("VERSION_CONFLICT","Refresh the job before cancelling.",409);
  if(job.unsafeToRetry) throw new ProjectError("PROVIDER_OUTCOME_UNKNOWN","This job needs operator review.",409);
  if(!job.active) return {data:jobDTO(job),status:200,operationId:id};
  // Running work is cooperative: retain the reservation until the provider settles.
  if(job.state==="QUEUED") await finish(c,job,"CANCELLED",null,session);
  else {
   await c.db.collection<IdeaJob>("generationJobs").updateOne({_id:id},{$set:{cancelRequested:true,updatedAt:new Date()},$inc:{resourceVersion:1}},{session});
   await c.db.collection<Project>("projects").updateOne({_id:projectId,resourceVersion:p.resourceVersion},{$inc:{resourceVersion:1}},{session});
  }
  return {data:{operationId:id,jobId:id,state:job.state==="QUEUED"?"CANCELLED":"CANCEL_REQUESTED",statusUrl:`/api/v1/projects/${projectId}/jobs/${id}`,pollAfterMs:3000},status:202,operationId:id};
 });
}
async function finish(c:DatabaseConnection,job:IdeaJob,state:IdeaJob["state"],error:IdeaJob["error"],session:ClientSession,proposalIds:string[]=[]) {
 const now=new Date(), unsafe=state==="REQUIRES_ATTENTION";
 await c.db.collection<IdeaJob>("generationJobs").updateOne({_id:job._id},{$set:{state,active:unsafe,stage:"FINISHED",finishedAt:now,updatedAt:now,error,unsafeToRetry:unsafe,proposalIds,"lease.expiresAt":null},$inc:{resourceVersion:1}},{session});
 await c.db.collection<Project>("projects").updateOne({_id:job.projectId,ownerId:job.ownerId,lifecycle:"ACTIVE",activeJobId:job._id},{$set:{activeJobId:unsafe?job._id:null,"statusProjection.creationStatus":unsafe?"NEEDS_ATTENTION":"DRAFT","statusProjection.computedAt":now,updatedAt:now},$inc:{resourceVersion:1}},{session});
 if(!unsafe) await c.db.collection("idempotencyRecords").updateMany({operationId:job._id,state:"ACCEPTED"},{$set:{state:"TERMINAL",terminalAt:now,expiresAt:new Date(now.getTime()+7*86400000)}},{session});
}
export async function runIdea(c:DatabaseConnection,id:string,provider=generateIdeas) {
 // A claim and SENT journal commit before any network effect. No claim can be sent twice.
 const holder=uuid7();
 const claimed=await inTransaction(c.client,async session=>{
  const job=await c.db.collection<IdeaJob>("generationJobs").findOne({_id:id,state:"QUEUED",active:true},{session}); if(!job) return null;
  const p=await c.db.collection<Project>("projects").findOne({_id:job.projectId,ownerId:job.ownerId,lifecycle:"ACTIVE",activeJobId:id},{session});
  if(!p || p.revision!==job.baseRevision) {await finish(c,job,"SUPERSEDED",null,session);return null;}
  if(!await c.db.collection<UserProfile>("userProfiles").findOneAndUpdate({_id:job.ownerId,lifecycle:"ACTIVE"},{$inc:{fenceVersion:1}},{session})) {await finish(c,job,"CANCELLED",null,session);return null;}
  await c.db.collection<Project>("projects").updateOne({_id:p._id,resourceVersion:p.resourceVersion},{$inc:{resourceVersion:1}},{session});
  const now=new Date(), updated=await c.db.collection<IdeaJob>("generationJobs").findOneAndUpdate({_id:id,state:"QUEUED"},{$set:{state:"RUNNING",stage:"PLANNING",startedAt:now,updatedAt:now,lease:{holder,epoch:job.lease.epoch+1,expiresAt:new Date(now.getTime()+180000)}},$inc:{resourceVersion:1}},{session,returnDocument:"after"});
  await c.db.collection("providerCalls").insertOne({_id:uuid7(),schemaVersion:1,ownerId:job.ownerId,projectId:job.projectId,jobId:id,createdAt:now,updatedAt:now,state:"SENT",requestHash:job.inputHash,modelVersion:job.input!.model,sentAt:now,finishedAt:null} as Document,{session});
  return updated;
 });
 if(!claimed?.input) return;
 let ideas:ReturnType<typeof validateIdeas>|null=null, failure:IdeaJob["error"]=null;
 try {ideas=validateIdeas(await provider(claimed.input),claimed.input.count);} catch(e) {failure=e instanceof ProjectError?{code:e.code,message:e.message}:{code:"PROVIDER_OUTCOME_UNKNOWN",message:"The provider result is uncertain. Operator review is required."};}
 const proposalId=uuid7();
 await inTransaction(c.client,async session=>{
  const job=await c.db.collection<IdeaJob>("generationJobs").findOne({_id:id,state:"RUNNING","lease.holder":holder,"lease.epoch":claimed.lease.epoch},{session}); if(!job) return;
  const now=new Date(), unsafe=failure?.code==="PROVIDER_OUTCOME_UNKNOWN";
  await c.db.collection("providerCalls").updateOne({jobId:id,state:"SENT"},{$set:{state:unsafe?"OUTCOME_UNKNOWN":failure?"FAILED":"SUCCEEDED",updatedAt:now,finishedAt:now}},{session});
  const p=await c.db.collection<Project>("projects").findOne({_id:job.projectId,ownerId:job.ownerId,lifecycle:"ACTIVE",activeJobId:id},{session});
  if(!p) {await finish(c,job,"CANCELLED",null,session);return;}
  if(unsafe) {await finish(c,job,"REQUIRES_ATTENTION",failure,session);return;}
  if(job.cancelRequested) {await finish(c,job,"CANCELLED",null,session);return;}
  if(failure || !ideas) {await finish(c,job,"FAILED",failure,session);return;}
  const stale=p.revision!==job.baseRevision, payload={ideas};
  await c.db.collection<Proposal>("proposals").insertOne({_id:proposalId,schemaVersion:1,ownerId:job.ownerId,projectId:job.projectId,createdAt:now,updatedAt:now,version:1,kind:"IDEAS",baseRevision:job.baseRevision,targetSceneId:null,state:stale?"CONFLICTED":"PENDING",payload,payloadHash:digest(payload),sourceJobId:id,appliedStoryboardId:null,appliedAt:null},{session});
  await finish(c,job,stale?"SUPERSEDED":"SUCCEEDED",null,session,[proposalId]);
 });
}
export async function drainIdeas(c:DatabaseConnection,provider=generateIdeas) {
 await verifyIdeas(c.db);
 const expired=await c.db.collection<IdeaJob>("generationJobs").find({state:"RUNNING","lease.expiresAt":{$lte:new Date()}}).limit(50).toArray();
 for(const row of expired) await inTransaction(c.client,async session=>{const job=await c.db.collection<IdeaJob>("generationJobs").findOne({_id:row._id,state:"RUNNING","lease.expiresAt":{$lte:new Date()}},{session});if(!job)return;await c.db.collection("providerCalls").updateOne({jobId:job._id,state:"SENT"},{$set:{state:"OUTCOME_UNKNOWN",updatedAt:new Date()}},{session});await finish(c,job,"REQUIRES_ATTENTION",{code:"PROVIDER_OUTCOME_UNKNOWN",message:"The worker stopped before recording the response. Operator review is required."},session);});
 const jobs=await c.db.collection<IdeaJob>("generationJobs").find({state:"QUEUED",active:true}).sort({createdAt:1}).limit(10).toArray();
 for(const job of jobs) await runIdea(c,job._id,provider);
 return jobs.length;
}
export async function ownedResource(c:DatabaseConnection,owner:string,projectId:string,id:string,kind:"jobs"|"proposals") { await readProject(c,owner,projectId);const row=await c.db.collection<IdeaJob|Proposal>(kind==="jobs"?"generationJobs":"proposals").findOne({_id:id,ownerId:owner,projectId});if(!row)throw missingProject();return row; }
