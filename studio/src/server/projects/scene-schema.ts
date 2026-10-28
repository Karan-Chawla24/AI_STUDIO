import "server-only";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import type {Db} from "mongodb";
import {DatabaseError} from "../db/config";
import {runMigration} from "../db/migrations";
import {migrateStoryboards,verifyStoryboards,storyboardValidators} from "./storyboard-schema";
import {storyboardValidator} from "./storyboard-shapes";
import {sceneShape} from "./scene-shapes";
const validators=Object.fromEntries(Object.entries({...storyboardValidators,storyboards:storyboardValidator}).map(([name,value])=>[name,sceneShape(name,value)]));
const partialFilterExpression={sourceProposalId:{$type:"string"}};
const id="F11_0001_scene_editing",checksum=createHash("sha256").update(JSON.stringify({validators,partialFilterExpression})).digest("hex");
export async function requireSceneMigration(db:Db){const row=await db.collection<{_id:string;state:string;checksum:string}>("schemaMigrations").findOne({_id:id});if(row?.state!=="APPLIED"||row.checksum!==checksum)throw new DatabaseError("SCENE_MIGRATION_REQUIRED","Run scene:migrate.");}
async function shape(db:Db){for(const [name,validator] of Object.entries(validators)){const row=await db.listCollections({name},{nameOnly:false}).next();if(!isDeepStrictEqual(row?.options?.validator,validator)||row?.options?.validationLevel!=="strict"||row?.options?.validationAction!=="error")throw new DatabaseError("SCENE_SCHEMA_DRIFT","Run scene:migrate and verify.");}const index=(await db.collection("storyboards").listIndexes().toArray()).find(i=>i.name==="storyboard_source");if(!index?.unique||!isDeepStrictEqual(index.partialFilterExpression,partialFilterExpression))throw new DatabaseError("SCENE_INDEX_DRIFT","Repair storyboard source index.");}
export async function verifyScenes(db:Db){await verifyStoryboards(db);await shape(db);await requireSceneMigration(db);}
export async function migrateScenes(db:Db){await migrateStoryboards(db);return runMigration(db,id,checksum,async()=>{
 for(const [name,validator] of Object.entries(validators))await db.command({collMod:name,validator,validationLevel:"strict",validationAction:"error"});
 const index=(await db.collection("storyboards").listIndexes().toArray()).find(i=>i.name==="storyboard_source");
 if(index&&!isDeepStrictEqual(index.partialFilterExpression,partialFilterExpression))await db.collection("storyboards").dropIndex("storyboard_source");
 await db.collection("storyboards").createIndex({sourceProposalId:1},{name:"storyboard_source",unique:true,partialFilterExpression});await shape(db);
 },()=>verifyScenes(db));}
