import assert from "node:assert/strict";
import {after,before,test} from "node:test";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import type {CollectionOptions,Document} from "mongodb";
import {connectDatabase,type DatabaseConnection} from "../src/server/db/client";
import {migrateStoryboards,verifyStoryboards} from "../src/server/projects/storyboard-schema";
import {migrateScenes,verifyScenes} from "../src/server/projects/scene-schema";
import {validateStoryboard,storyboardHash,type Storyboard} from "../src/server/projects/storyboard-model";
import {uuid7} from "../src/server/projects/model";

let server:MongoMemoryReplSet,c:DatabaseConnection;
const migrationId="F11_0001_scene_editing";
before(async()=>{server=await MongoMemoryReplSet.create({binary:{version:"8.2.6"},replSet:{count:1}});c=await connectDatabase({uri:server.getUri(),database:"scene_migration_tests",production:false});},{timeout:120000});
after(async()=>{await c?.client.close();await server?.stop();});

test("failed source-index replacement resumes under the migration lock without losing snapshots",async(t)=>{
 const db=c.client.db("source_index_recovery");await migrateStoryboards(db);
 const previous=await db.collection("schemaMigrations").find({state:"APPLIED"}).toArray();
 const content=validateStoryboard({title:"Internet",hook:"Follow a request",scenes:Array.from({length:6},()=>({narration:"A request travels.",visualDescription:"A labelled arrow.",motionDescription:"Move the request.",sceneType:"DIAGRAM",captionHighlights:[]}))});
 const snapshot:Storyboard={_id:uuid7(),schemaVersion:1,ownerId:"fixture",projectId:uuid7(),createdAt:new Date(),version:1,baseRevision:1,...content,targetDurationSeconds:75,visualStyle:"minimal_editorial",compileState:"NEEDS_COMPILATION",contentHash:storyboardHash({...content,targetDurationSeconds:75}),warnings:[],compilerVersion:null,templateCatalogVersion:"visual-v1",normalizerVersion:"speech-pass-through-v1",sourceProposalId:uuid7(),sourceJobId:uuid7()};
 await db.collection<Storyboard>("storyboards").insertOne(snapshot);
 const originalCollection=db.collection.bind(db);let creations=0;
 t.mock.method(db,"collection",((name:string,options?:CollectionOptions)=>{
  const collection=originalCollection(name,options);
  if(name==="storyboards"){
   const originalCreate=collection.createIndex.bind(collection);
   collection.createIndex=async(keys,options)=>{
    if(options?.name==="storyboard_source"&&options.partialFilterExpression){
     creations++;
     const lock=await originalCollection<{_id:string;checkpoint:string}>("schemaMigrations").findOne({_id:"__migration_lock__"});
     assert.equal(lock?.checkpoint,migrationId);
     if(creations===1)throw new Error("Injected replacement createIndex failure");
    }
    return originalCreate(keys,options);
   };
  }
  return collection;
 }) as typeof db.collection);
 await assert.rejects(migrateScenes(db),/Injected replacement createIndex failure/);
 const records=db.collection<Document & {_id:string}>("schemaMigrations");
 const failed=await records.findOne({_id:migrationId});assert.equal(failed?.state,"FAILED");
 assert.equal(await records.countDocuments({_id:"__migration_lock__"}),0);
 assert.ok(!(await db.collection("storyboards").listIndexes().toArray()).some(i=>i.name==="storyboard_source"));
 // Ordinary verification still detects the gap instead of concealing it.
 await assert.rejects(verifyStoryboards(db),{code:"STORYBOARD_INDEX_DRIFT"});
 await assert.rejects(verifyScenes(db),{code:"STORYBOARD_INDEX_DRIFT"});
 const manual=[2,3].map(version=>({...snapshot,_id:uuid7(),version,sourceProposalId:null,sourceJobId:null}));
 await db.collection<Storyboard>("storyboards").insertMany(manual);
 // Resumption must not steal an active or expired global migration lock.
 await records.insertOne({...failed!,_id:"__migration_lock__",state:"RUNNING",leaseExpiresAt:new Date(0)});
 await assert.rejects(migrateScenes(db),{code:"DB_MIGRATION_LOCKED"});assert.equal(creations,1);
 await records.deleteOne({_id:"__migration_lock__"});
 assert.equal(await migrateScenes(db),"applied");assert.equal(creations,2);
 await verifyScenes(db);await verifyStoryboards(db);
 const index=(await db.collection("storyboards").listIndexes().toArray()).find(i=>i.name==="storyboard_source")!;
 assert.deepEqual(index.key,{sourceProposalId:1});assert.equal(index.unique,true);assert.deepEqual(index.partialFilterExpression,{sourceProposalId:{$type:"string"}});
 assert.deepEqual(await db.collection<Storyboard>("storyboards").find({}).sort({version:1}).toArray(),[snapshot,...manual]);
 await assert.rejects(db.collection<Storyboard>("storyboards").insertOne({...snapshot,_id:uuid7(),version:4}),{code:11000});
 assert.equal((await records.findOne({_id:migrationId}))?.state,"APPLIED");
 for(const row of previous)assert.equal((await records.findOne({_id:String(row._id)}))?.checksum,row.checksum);
 assert.equal(await migrateScenes(db),"already-applied");assert.equal(creations,2);
});

test("recovery does not repair unrelated index drift or bypass applied-state verification",async()=>{
 const db=c.client.db("source_index_guardrails");await migrateScenes(db);
 const records=db.collection<Document & {_id:string}>("schemaMigrations");
 await db.collection("storyboards").dropIndex("storyboard_source");
 await assert.rejects(migrateScenes(db),{code:"STORYBOARD_INDEX_DRIFT"});
 // A matching failed F11 receipt alone cannot excuse a second missing index.
 await records.updateOne({_id:migrationId},{$set:{state:"FAILED"}});
 await db.collection("storyboards").dropIndex("storyboard_history");
 await assert.rejects(migrateScenes(db),{code:"STORYBOARD_INDEX_DRIFT"});
 assert.ok(!(await db.collection("storyboards").listIndexes().toArray()).some(i=>i.name==="storyboard_source"));
 // A wrong checksum must not activate the recovery exception.
 await db.collection("storyboards").createIndex({ownerId:1,projectId:1,createdAt:-1,_id:-1},{name:"storyboard_history"});
 await records.updateOne({_id:migrationId},{$set:{checksum:"0".repeat(64)}});
 await assert.rejects(migrateScenes(db),{code:"STORYBOARD_INDEX_DRIFT"});
 assert.ok(!(await db.collection("storyboards").listIndexes().toArray()).some(i=>i.name==="storyboard_source"));
});
