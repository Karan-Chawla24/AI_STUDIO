import "server-only";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import type {Db} from "mongodb";
import {DatabaseError} from "../db/config";
import {runMigration} from "../db/migrations";
import {migrateScenes,verifyScenes,sceneValidators} from "./scene-schema";
import {compileShape} from "./compile-shapes";
const validators=Object.fromEntries(Object.entries(sceneValidators).map(([name,value])=>[name,compileShape(name,value)]));
const id="F12_0001_compilation_approval",checksum=createHash("sha256").update(JSON.stringify(validators)).digest("hex");
export async function requireCompileMigration(db:Db){const row=await db.collection<{_id:string;checksum:string;state:string}>("schemaMigrations").findOne({_id:id});if(row?.checksum!==checksum||row.state!=="APPLIED")throw new DatabaseError("COMPILE_MIGRATION_REQUIRED","Run compile:migrate.");}
async function shape(db:Db){for(const [name,validator]of Object.entries(validators)){const row=await db.listCollections({name},{nameOnly:false}).next();if(!isDeepStrictEqual(row?.options?.validator,validator)||row?.options?.validationLevel!=="strict"||row?.options?.validationAction!=="error")throw new DatabaseError("COMPILE_SCHEMA_DRIFT","Run compile:migrate and verify.");}}
export async function verifyCompilation(db:Db){await verifyScenes(db);await shape(db);await requireCompileMigration(db);}
export async function migrateCompilation(db:Db){await migrateScenes(db);return runMigration(db,id,checksum,async()=>{for(const[name,validator]of Object.entries(validators))await db.command({collMod:name,validator,validationLevel:"strict",validationAction:"error"});await shape(db);},()=>verifyCompilation(db));}
