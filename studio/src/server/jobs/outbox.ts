import "server-only";
import type {ClientSession,Db} from "mongodb";
import {uuid7} from "../projects/model";
import type {IdeaJob} from "../projects/ideas-model";
import {requireJobsMigration} from "./schema";
export type DispatchEvent={id:string;name:"studio/planning.requested";data:{eventId:string;jobId:string}};
type Lease={holder:string|null;epoch:number;expiresAt:Date|null};
export type Outbox={_id:string;aggregateId:string;state:"PENDING"|"CLAIMED"|"DELIVERED";attempts:number;nextAttemptAt:Date;lease:Lease;deliveredAt:Date|null;createdAt:Date};
export type Attempt={_id:string;ownerId:string;projectId:string;rootId:string;parentId:string|null;attempt:number;createdAt:Date};
export async function enqueueJob(db:Db,job:IdeaJob,session:ClientSession,parent?:Attempt){
 await requireJobsMigration(db);
 await db.collection<Attempt>("jobAttempts").insertOne({_id:job._id,ownerId:job.ownerId,projectId:job.projectId,rootId:parent?.rootId??job._id,parentId:parent?._id??null,attempt:(parent?.attempt??0)+1,createdAt:job.createdAt},{session});
 await db.collection("outboxEvents").insertOne({_id:job._id,schemaVersion:1,aggregateType:"JOB",aggregateId:job._id,aggregateVersion:1,eventType:"studio/planning.requested",createdAt:job.createdAt,state:"PENDING",attempts:0,nextAttemptAt:job.createdAt,lease:{holder:null,epoch:0,expiresAt:null},deliveredAt:null} as never,{session});
}
// A failed/uncertain send is retried with the SAME event ID. Only the consumer may call a provider.
export async function dispatchOutbox(db:Db,send:(event:DispatchEvent)=>Promise<unknown>,limit=20){
 await requireJobsMigration(db);let delivered=0;
 for(let i=0;i<limit;i++){
  const now=new Date(),holder=uuid7();
  const row=await db.collection<Outbox>("outboxEvents").findOneAndUpdate({$or:[{state:"PENDING",nextAttemptAt:{$lte:now}},{state:"CLAIMED","lease.expiresAt":{$lte:now}}]},{$set:{state:"CLAIMED","lease.holder":holder,"lease.expiresAt":new Date(now.getTime()+30000)},$inc:{attempts:1,"lease.epoch":1}},{sort:{nextAttemptAt:1},returnDocument:"after"});
  if(!row)break;
  const guard={_id:row._id,state:"CLAIMED" as const,"lease.holder":holder,"lease.epoch":row.lease.epoch};
  try{
   await send({id:row._id,name:"studio/planning.requested",data:{eventId:row._id,jobId:row.aggregateId}});
   const result=await db.collection<Outbox>("outboxEvents").updateOne(guard,{$set:{state:"DELIVERED",deliveredAt:new Date(),"lease.expiresAt":null}});delivered+=result.modifiedCount;
  }catch{
   await db.collection<Outbox>("outboxEvents").updateOne(guard,{$set:{state:"PENDING",nextAttemptAt:new Date(Date.now()+Math.min(300000,1000*2**Math.min(row.attempts,8))),"lease.expiresAt":null}});
  }
 }
 return delivered;
}
export async function jobHealth(db:Db){const now=Date.now(),oldest=await db.collection<Outbox>("outboxEvents").findOne({state:{$ne:"DELIVERED"}},{sort:{createdAt:1}});return {pending:await db.collection("outboxEvents").countDocuments({state:{$ne:"DELIVERED"}}),oldestPendingSeconds:oldest?Math.floor((now-oldest.createdAt.getTime())/1000):0,attention:await db.collection("generationJobs").countDocuments({state:"REQUIRES_ATTENTION",unsafeToRetry:true})};}
