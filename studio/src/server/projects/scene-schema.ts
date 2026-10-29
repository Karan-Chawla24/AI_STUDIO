import {settingsShape} from "./settings-shapes";
import {compileShape} from "./compile-shapes";
import "server-only";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import type {Db} from "mongodb";
import {DatabaseError} from "../db/config";
import {runMigration} from "../db/migrations";
import {migrateStoryboards,verifyStoryboards,verifyStoryboardsForSceneRecovery,storyboardValidators} from "./storyboard-schema";
import {storyboardValidator} from "./storyboard-shapes";
import {sceneShape} from "./scene-shapes";
export const sceneValidators=Object.fromEntries(Object.entries({...storyboardValidators,storyboards:storyboardValidator}).map(([name,value])=>[name,sceneShape(name,value)]));
const partialFilterExpression={sourceProposalId:{$type:"string"}};
const id="F11_0001_scene_editing",checksum=createHash("sha256").update(JSON.stringify({validators:sceneValidators,partialFilterExpression})).digest("hex");
export async function requireSceneMigration(db:Db){const row=await db.collection<{_id:string;state:string;checksum:string}>("schemaMigrations").findOne({_id:id});if(row?.state!=="APPLIED"||row.checksum!==checksum)throw new DatabaseError("SCENE_MIGRATION_REQUIRED","Run scene:migrate.");}
async function shape(db:Db){for(const [name,validator] of Object.entries(sceneValidators)){const row=await db.listCollections({name},{nameOnly:false}).next();if((!isDeepStrictEqual(row?.options?.validator,validator)&&!isDeepStrictEqual(row?.options?.validator,compileShape(name,validator)) && !isDeepStrictEqual(row?.options?.validator,settingsShape(name,compileShape(name,validator))))||row?.options?.validationLevel!=="strict"||row?.options?.validationAction!=="error")throw new DatabaseError("SCENE_SCHEMA_DRIFT","Run scene:migrate and verify.");}const index=(await db.collection("storyboards").listIndexes().toArray()).find(i=>i.name==="storyboard_source");if(!index?.unique||!isDeepStrictEqual(index.partialFilterExpression,partialFilterExpression))throw new DatabaseError("SCENE_INDEX_DRIFT","Repair storyboard source index.");}
export async function verifyScenes(db:Db){await verifyStoryboards(db);await shape(db);await requireSceneMigration(db);}
export async function migrateScenes(db:Db){
 // F11 can fail between dropping the old source index and creating its replacement.
 // Do not run F10's strict applied verification before resuming that known upgrade.
 const previous=await db.collection<{_id:string;state:string;checksum:string}>("schemaMigrations").findOne({_id:id});
 const resuming=previous?.checksum===checksum&&["FAILED","RUNNING"].includes(previous.state);
 if(!resuming)await migrateStoryboards(db);
 return runMigration(db,id,checksum,async()=>{
 if(resuming)await verifyStoryboardsForSceneRecovery(db);
 for(const [name,validator] of Object.entries(sceneValidators))await db.command({collMod:name,validator,validationLevel:"strict",validationAction:"error"});
 const index=(await db.collection("storyboards").listIndexes().toArray()).find(i=>i.name==="storyboard_source");
 if(index&&!isDeepStrictEqual(index.partialFilterExpression,partialFilterExpression))await db.collection("storyboards").dropIndex("storyboard_source");
 await db.collection("storyboards").createIndex({sourceProposalId:1},{name:"storyboard_source",unique:true,partialFilterExpression});await shape(db);
 },()=>verifyScenes(db));}
