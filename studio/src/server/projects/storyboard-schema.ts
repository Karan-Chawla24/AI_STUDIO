import "server-only";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import type {Db} from "mongodb";
import {runMigration} from "../db/migrations";
import {DatabaseError} from "../db/config";
import {schemas,extensions,migrateIdeas,verifyIdeas} from "./ideas-schema";
import {projectSchemas} from "./schema";
import {deletionShape} from "./deletion-shapes";
import {planShape} from "./plan-shapes";
import {storyboardShape,storyboardValidator} from "./storyboard-shapes";
const validators=Object.fromEntries(Object.entries({...schemas,...extensions,auditEvents:planShape("auditEvents",deletionShape("auditEvents",projectSchemas.auditEvents))}).map(([name,value])=>[name,storyboardShape(name,value)]));
const indexes=[{name:"storyboard_version",key:{projectId:1,version:1},unique:true},{name:"storyboard_history",key:{ownerId:1,projectId:1,createdAt:-1,_id:-1}},{name:"storyboard_source",key:{sourceProposalId:1},unique:true}] as const;
const id="F10_0001_storyboards",checksum=createHash("sha256").update(JSON.stringify({validators,storyboardValidator,indexes})).digest("hex");
async function shape(db:Db){
 for(const [name,validator] of Object.entries({...validators,storyboards:storyboardValidator})){
  const info=await db.listCollections({name},{nameOnly:false}).next();if(!isDeepStrictEqual(info?.options?.validator,validator)||info?.options?.validationLevel!=="strict"||info?.options?.validationAction!=="error")throw new DatabaseError("STORYBOARD_SCHEMA_DRIFT","Run storyboard:migrate and verify the schema.");
 }
 const actual=await db.collection("storyboards").listIndexes().toArray();for(const index of indexes){const found=actual.find(i=>i.name===index.name);if(!found||!isDeepStrictEqual(found.key,index.key)||!!found.unique!==("unique" in index)||found.sparse||found.hidden||found.partialFilterExpression)throw new DatabaseError("STORYBOARD_INDEX_DRIFT","Storyboard indexes require repair.");}
}
export async function requireStoryboardMigration(db:Db){const record=await db.collection<{_id:string;state:string;checksum:string}>("schemaMigrations").findOne({_id:id});if(record?.state!=="APPLIED"||record.checksum!==checksum)throw new DatabaseError("STORYBOARD_MIGRATION_REQUIRED","Run storyboard:migrate.");}
export async function verifyStoryboards(db:Db){await verifyIdeas(db);await shape(db);await requireStoryboardMigration(db);}
export async function migrateStoryboards(db:Db){await migrateIdeas(db);return runMigration(db,id,checksum,async()=>{for(const [name,validator]of Object.entries(validators))await db.command({collMod:name,validator,validationLevel:"strict",validationAction:"error"});if(!await db.listCollections({name:"storyboards"}).next())await db.createCollection("storyboards",{validator:storyboardValidator,validationLevel:"strict",validationAction:"error"});for(const {key,...options}of indexes)await db.collection("storyboards").createIndex(key,options);await shape(db);},()=>verifyStoryboards(db));}
