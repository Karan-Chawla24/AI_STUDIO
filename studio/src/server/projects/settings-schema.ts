import "server-only";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import type {Db} from "mongodb";
import {DatabaseError} from "../db/config";
import {runMigration} from "../db/migrations";
import {compileValidators,migrateCompilation,verifyCompilation} from "./compile-schema";
import {settingsShape} from "./settings-shapes";
const validators=Object.fromEntries(Object.entries(compileValidators).map(([name,value])=>[name,settingsShape(name,value)]));
const id="F13_0001_project_settings",checksum=createHash("sha256").update(JSON.stringify({validators,invalidation:"legacy-voice-bindings-v1"})).digest("hex");
export async function requireSettingsMigration(db:Db){const row=await db.collection<{_id:string;checksum:string;state:string}>("schemaMigrations").findOne({_id:id});if(row?.checksum!==checksum||row.state!=="APPLIED")throw new DatabaseError("SETTINGS_MIGRATION_REQUIRED","Run settings:migrate.");}
async function shape(db:Db){for(const[name,validator]of Object.entries(validators)){const row=await db.listCollections({name},{nameOnly:false}).next();if(!isDeepStrictEqual(row?.options?.validator,validator)||row?.options?.validationLevel!=="strict"||row?.options?.validationAction!=="error")throw new DatabaseError("SETTINGS_SCHEMA_DRIFT","Run settings:migrate and verify.");}}
export async function verifySettings(db:Db){await verifyCompilation(db);await shape(db);await requireSettingsMigration(db);}
export async function migrateSettings(db:Db){await migrateCompilation(db);return runMigration(db,id,checksum,async()=>{for(const[name,validator]of Object.entries(validators))await db.command({collMod:name,validator,validationLevel:"strict",validationAction:"error"});await db.collection("projects").updateMany({approval:{$ne:null}},{$set:{approval:null,currentSnapshotHash:null,"statusProjection.creationStatus":"STORYBOARD_REVIEW",updatedAt:new Date()},$inc:{revision:1,resourceVersion:1,"publishFence.epoch":1}});await shape(db);},()=>verifySettings(db));}
