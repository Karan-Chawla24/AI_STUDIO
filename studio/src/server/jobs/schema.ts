import "server-only";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import type {Db,Document} from "mongodb";
import {DatabaseError} from "../db/config";
import {runMigration} from "../db/migrations";
import {migrateSettings,verifySettings,settingsValidators} from "../projects/settings-schema";
import {jobsShape} from "./shapes";

const str={bsonType:"string",minLength:1,maxLength:200}, date={bsonType:"date"}, nullableDate={bsonType:["date","null"]};
const integer={bsonType:["int","long","double"],minimum:0,maximum:Number.MAX_SAFE_INTEGER,multipleOf:1};
const obj=(properties:Document)=>({bsonType:"object",additionalProperties:false,required:Object.keys(properties),properties});
const lease=obj({holder:{bsonType:["string","null"]},epoch:integer,expiresAt:nullableDate});
const schemas:Record<string,Document>={
 idempotencyRecords:jobsShape(settingsValidators.idempotencyRecords),
 outboxEvents:{$jsonSchema:obj({_id:str,schemaVersion:{enum:[1]},aggregateType:{enum:["JOB"]},aggregateId:str,aggregateVersion:integer,eventType:{enum:["studio/planning.requested"]},createdAt:date,state:{enum:["PENDING","CLAIMED","DELIVERED"]},attempts:integer,nextAttemptAt:date,lease,deliveredAt:nullableDate})},
 inboxEvents:{$jsonSchema:obj({_id:str,consumer:{enum:["planning-v1"]},eventId:str,aggregateId:str,state:{enum:["APPLIED"]},appliedAt:date})},
 jobAttempts:{$jsonSchema:obj({_id:str,ownerId:str,projectId:str,rootId:str,parentId:{bsonType:["string","null"]},attempt:{...integer,minimum:1,maximum:3},createdAt:date})},
 jobSteps:{$jsonSchema:obj({_id:str,jobId:str,ownerId:str,projectId:str,stepKey:{enum:["planning"]},inputHash:str,state:{enum:["RUNNING","SUCCEEDED","FAILED","CANCELLED","OUTCOME_UNKNOWN"]},lease,startedAt:date,finishedAt:nullableDate})},
 jobResolutions:{$jsonSchema:obj({_id:str,jobId:str,ownerId:str,projectId:str,operator:str,reason:{...str,maxLength:1000},duplicateCostAccepted:{enum:[true]},createdAt:date})},
};
const indexes:Record<string,{name:string;key:Record<string,1>;unique?:boolean;partialFilterExpression?:Document}[]>={
 idempotencyRecords:[],
 outboxEvents:[{name:"outbox_aggregate_event",key:{aggregateType:1,aggregateId:1,aggregateVersion:1,eventType:1},unique:true},{name:"outbox_due",key:{state:1,nextAttemptAt:1}},{name:"outbox_recovery",key:{state:1,"lease.expiresAt":1}}],
 inboxEvents:[{name:"inbox_dedup",key:{consumer:1,eventId:1},unique:true}],
 jobAttempts:[{name:"attempt_root_number",key:{rootId:1,attempt:1},unique:true},{name:"attempt_parent",key:{parentId:1},unique:true,partialFilterExpression:{parentId:{$type:"string"}}}],
 jobSteps:[{name:"step_job_key",key:{jobId:1,stepKey:1},unique:true}],
 jobResolutions:[{name:"resolution_job",key:{jobId:1},unique:true}],
};
const id="F14_0001_durable_planning", checksum=createHash("sha256").update(JSON.stringify({schemas,indexes})).digest("hex");
export async function requireJobsMigration(db:Db){const row=await db.collection<{_id:string;state:string;checksum:string}>("schemaMigrations").findOne({_id:id});if(row?.state!=="APPLIED"||row.checksum!==checksum)throw new DatabaseError("JOBS_MIGRATION_REQUIRED","Run jobs:migrate before accepting work.");}
export async function verifyJobs(db:Db){
 await verifySettings(db);await requireJobsMigration(db);
 for(const [name,validator]of Object.entries(schemas)){
  const row=await db.listCollections({name},{nameOnly:false}).next();
  if(!isDeepStrictEqual(row?.options?.validator,validator)||row?.options?.validationLevel!=="strict"||row?.options?.validationAction!=="error")throw new DatabaseError("JOBS_SCHEMA_DRIFT","Review durable job validators.");
  const actual=await db.collection(name).listIndexes().toArray();
  for(const expected of indexes[name]){const found=actual.find(i=>i.name===expected.name);if(!found||!isDeepStrictEqual(found.key,expected.key)||!!found.unique!==!!expected.unique||!isDeepStrictEqual(found.partialFilterExpression,expected.partialFilterExpression)||found.hidden||found.sparse||found.expireAfterSeconds!==undefined)throw new DatabaseError("JOBS_INDEX_DRIFT","Review durable job indexes.");}
 }
}
export async function migrateJobs(db:Db){
 await migrateSettings(db);
 return runMigration(db,id,checksum,async()=>{
  for(const [name,validator]of Object.entries(schemas)){
   if(name==="idempotencyRecords")await db.command({collMod:name,validator,validationLevel:"strict",validationAction:"error"});
   else if(!await db.listCollections({name}).next())await db.createCollection(name,{validator,validationLevel:"strict",validationAction:"error"});
   for(const {key,...options}of indexes[name])await db.collection(name).createIndex(key,options);
  }
  // Backfill only immutable identifiers; no prompt data or provider resend.
  for await(const job of db.collection("generationJobs").find({})){
   await db.collection("jobAttempts").updateOne({_id:job._id},{$setOnInsert:{ownerId:job.ownerId,projectId:job.projectId,rootId:job._id,parentId:null,attempt:1,createdAt:job.createdAt}},{upsert:true});
   if(job.state==="QUEUED"&&job.active)await db.collection("outboxEvents").updateOne({_id:job._id},{$setOnInsert:{schemaVersion:1,aggregateType:"JOB",aggregateId:job._id,aggregateVersion:1,eventType:"studio/planning.requested",createdAt:job.createdAt,state:"PENDING",attempts:0,nextAttemptAt:new Date(),lease:{holder:null,epoch:0,expiresAt:null},deliveredAt:null}},{upsert:true});
  }
 },()=>verifyJobs(db));
}
