import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID} from "node:crypto";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import {connectDatabase,type DatabaseConnection} from "../src/server/db/client";
import {provisionProfile} from "../src/server/auth/profile";
import {migrateIdeas} from "../src/server/projects/ideas-schema";
import {migrateStoryboards,verifyStoryboards} from "../src/server/projects/storyboard-schema";
import {validateStoryboard,storyboardInput,storyboardHash,type StoryboardProposal,type Storyboard} from "../src/server/projects/storyboard-model";
import {createProject,readProject} from "../src/server/projects/service";
import {validateCreate} from "../src/server/projects/model";
import {admitIdeas,runIdea,decideProposal,cancelIdea,ownedResource} from "../src/server/projects/ideas";
import {ideaList,ideasRequest} from "../src/server/projects/ideas-http";
import {csrfToken} from "../src/server/projects/http";
import {updatePlan} from "../src/server/projects/plan";
import {deleteProject,cleanDeletion} from "../src/server/projects/deletion";
let server:MongoMemoryReplSet,c:DatabaseConnection;
const owner="story-owner",user={id:owner,name:"Story Test",email:"story@example.com",emailVerified:true,createdAt:new Date(),updatedAt:new Date()},config={origin:"http://localhost:3001",secure:false,secret:"a".repeat(40)};
const fixture=()=>({title:"The internet, explained",hook:"What happens after you tap a link?",scenes:Array.from({length:6},(_,i)=>({narration:`Step ${i+1}: Your browser sends a small request through the network. Each device helps that request reach the server and find its way back.`,visualDescription:"Show a browser connected to a server with a labelled arrow.",motionDescription:"Reveal the browser, then move a small packet along the arrow as the narration describes it.",sceneType:i===0?"TITLE":"PROCESS_FLOW",captionHighlights:["browser"]}))});
const create=async()=> (await createProject(c,owner,validateCreate({title:"Internet",originalIdea:"Explain the internet to beginners"}),randomUUID(),randomUUID())).data;
const admit=(id:string,revision=1,replace=false,key=randomUUID())=>admitIdeas(c,owner,id,"STORYBOARD_GENERATE",{expectedRevision:revision,guidance:"",replaceExistingConfirmed:replace},key,true,"gemini-test");
const proposal=async(id:string)=>(await c.db.collection<StoryboardProposal>("proposals").findOne({projectId:id,kind:"STORYBOARD"},{sort:{createdAt:-1}}))!;
const generate=async(id:string,revision=1,replace=false)=>{const a=await admit(id,revision,replace);await runIdea(c,String(a.data.jobId),async()=>fixture());return proposal(id);};
const apply=(id:string,p:StoryboardProposal,revision=p.baseRevision,key=randomUUID(),requestId=randomUUID())=>decideProposal(c,owner,id,p._id,"apply",{expectedVersion:p.version,expectedRevision:revision},key,requestId);
before(async()=>{server=await MongoMemoryReplSet.create({binary:{version:"8.2.6"},replSet:{count:1}});c=await connectDatabase({uri:server.getUri(),database:"studio_storyboard_test",production:false});await migrateIdeas(c.db);const old=await c.db.collection("schemaMigrations").find({state:"APPLIED"}).toArray();await migrateStoryboards(c.db);for(const row of old)assert.equal((await c.db.collection("schemaMigrations").findOne({_id:row._id}))?.checksum,row.checksum);await provisionProfile(c.db,user);await provisionProfile(c.db,{...user,id:"story-other"});},{timeout:240000});
after(async()=>{await c?.client.close();await server?.stop();});
test("forward migration is repeatable and keeps earlier checksums valid",async()=>{assert.equal(await migrateStoryboards(c.db),"already-applied");await verifyStoryboards(c.db);});
test("provider contract rejects arbitrary fields, unsupported types, bad counts and highlights",()=>{
 assert.throws(()=>storyboardInput({guidance:"x"}),{code:"PRECONDITION_REQUIRED"});assert.throws(()=>storyboardInput({expectedRevision:1,replaceExistingConfirmed:"yes"}));
 for(const mutate of [(x:ReturnType<typeof fixture>)=>{x.scenes.length=5;},(x:ReturnType<typeof fixture>)=>{x.scenes[0].sceneType="CODE";},(x:ReturnType<typeof fixture>)=>{x.scenes[0].captionHighlights=["absent phrase"];},(x:ReturnType<typeof fixture>)=>{Object.assign(x.scenes[0],{ownerId:owner});}]){const x=fixture();mutate(x);assert.throws(()=>validateStoryboard(x),{code:"INVALID_PROVIDER_OUTPUT"});}
 const validated=validateStoryboard(fixture());assert.deepEqual(validated.scenes.map(s=>s.order),[0,1,2,3,4,5]);assert.equal(new Set(validated.scenes.map(s=>s.sceneId)).size,6);
 const hash=storyboardHash({...validated,targetDurationSeconds:75});assert.equal(storyboardHash({...validateStoryboard(fixture()),targetDurationSeconds:75}),hash);assert.notEqual(storyboardHash({...validated,title:"Changed title",targetDurationSeconds:75}),hash);
});
test("generation is only a proposal; accepting is atomic and same-key replay is stable",async()=>{
 const p=await create(),q=await generate(p.id);assert.equal((await readProject(c,owner,p.id)).activeStoryboardId,null);assert.equal(await c.db.collection("storyboards").countDocuments({projectId:p.id}),0);
 const key=randomUUID(),a=await apply(p.id,q,1,key);assert.equal(a.data.project.revision,2);assert.equal(a.data.project.creationStatus,"STORYBOARD_REVIEW");assert.equal(a.data.storyboard.scenes.length,6);assert.equal(a.data.storyboard.compileState,"NEEDS_COMPILATION");assert.equal(a.data.project.approval,null);
 assert.equal((await apply(p.id,q,1,key)).data.storyboard.id,a.data.storyboard.id);assert.equal(await c.db.collection("storyboards").countDocuments({projectId:p.id}),1);
});
test("replacement requires confirmation and retains immutable accepted history",async()=>{
 const p=await create(),q=await generate(p.id);const first=(await apply(p.id,q)).data.storyboard;await assert.rejects(admit(p.id,2),{code:"REPLACEMENT_CONFIRMATION_REQUIRED"});
 const replacement=await generate(p.id,2,true);assert.equal((await readProject(c,owner,p.id)).activeStoryboardId,first.id);const second=(await apply(p.id,replacement)).data.storyboard;assert.equal(second.version,2);assert.notEqual(second.id,first.id);
 const old=await ownedResource(c,owner,p.id,first.id,"storyboards") as Storyboard;assert.equal(old.version,1);assert.equal(old.contentHash,first.contentHash);
 const page=await ideaList(c,owner,p.id,"storyboards",new URLSearchParams({limit:"1"}),config.secret);assert.ok(page.page.nextCursor);const next=await ideaList(c,owner,p.id,"storyboards",new URLSearchParams({limit:"1",cursor:page.page.nextCursor!}),config.secret);assert.notEqual(page.items[0].id,next.items[0].id);
 await assert.rejects(ownedResource(c,"story-other",p.id,first.id,"storyboards"),{code:"RESOURCE_NOT_FOUND"});
});
test("plan changes retain accepted scenes and warn; stale proposals cannot apply",async()=>{
 const p=await create(),q=await generate(p.id);const first=(await apply(p.id,q)).data.storyboard;const replacement=await generate(p.id,2,true);
 const changed=await updatePlan(c,owner,p.id,{expectedRevision:2,refinedIdea:"A revised explanation"},randomUUID());assert.equal(changed.activeStoryboardId,first.id);assert.equal(changed.warnings[0].code,"PLAN_CHANGED");assert.equal((await apply(p.id,replacement,3)).status,409);assert.equal((await proposal(p.id)).state,"CONFLICTED");
});
test("competing apply requests install exactly one version and audit failure rolls back",async()=>{
 const p=await create(),q=await generate(p.id);const results=await Promise.allSettled([apply(p.id,q),apply(p.id,q)]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(await c.db.collection("storyboards").countDocuments({projectId:p.id}),1);
 const p2=await create(),q2=await generate(p2.id);const trace=(await c.db.collection("auditEvents").findOne({aggregateId:p2.id}))!.requestId;await c.db.collection("auditEvents").createIndex({requestId:1},{unique:true,name:"test_story_audit"});
 try{await assert.rejects(apply(p2.id,q2,1,randomUUID(),trace));assert.equal(await c.db.collection("storyboards").countDocuments({projectId:p2.id}),0);assert.equal((await readProject(c,owner,p2.id)).activeStoryboardId,null);assert.equal((await proposal(p2.id)).state,"PENDING");}finally{await c.db.collection("auditEvents").dropIndex("test_story_audit");}
});
test("cancellation and deleted projects cannot install delayed storyboard results",async()=>{
 const p=await create(),a=await admit(p.id);await cancelIdea(c,owner,p.id,String(a.data.jobId),1,randomUUID());let calls=0;await runIdea(c,String(a.data.jobId),async()=>{calls++;return fixture();});assert.equal(calls,0);
 const q=await generate(p.id);await apply(p.id,q);const pending=await admit(p.id,2,true);let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(r=>{entered=r;});const running=runIdea(c,String(pending.data.jobId),async()=>{entered();await new Promise<void>(r=>{release=r;});return fixture();});await waiting;
 const deletion=await deleteProject(c,owner,p.id,{expectedRevision:2,confirmation:"DELETE_PROJECT"},randomUUID(),randomUUID());await cleanDeletion(c,deletion.data.deletionId);release();await running;
 assert.equal(await c.db.collection("storyboards").countDocuments({projectId:p.id}),0);assert.equal(await c.db.collection("proposals").countDocuments({projectId:p.id}),0);
});
test("HTTP enforces verification and strict body; storyboard apply rejects selectedIdeaId",async()=>{
 const p=await create(),profile=(await provisionProfile(c.db,user))!,identity={user,profile,sessionId:"story-session"};
 const response=await ideasRequest(new Request(`${config.origin}/api/v1/projects/${p.id}/storyboards/generate`,{method:"POST",headers:{Origin:config.origin,"Content-Type":"application/json","X-CSRF-Token":csrfToken(identity,config.secret),"Idempotency-Key":randomUUID()},body:JSON.stringify({expectedRevision:1})}),p.id,["storyboards","generate"],{connection:c,config,identity:{...identity,user:{...user,emailVerified:false}}});assert.equal(response.status,403);
 const q=await generate(p.id);await assert.rejects(decideProposal(c,owner,p.id,q._id,"apply",{expectedRevision:1,expectedVersion:1,selectedIdeaId:"unexpected"},randomUUID(),randomUUID()),{code:"VALIDATION_FAILED"});
});
test("planning admission, replay, worker and apply do not run collection/index audits",async(t)=>{
 const p=await create();
 const audit=t.mock.method(c.db,"listCollections",()=>{throw new Error("full metadata audit on the request path");});
 try {
  const key=randomUUID(),accepted=await admit(p.id,1,false,key);
  assert.equal((await admit(p.id,1,false,key)).data.jobId,accepted.data.jobId);
  await runIdea(c,String(accepted.data.jobId),async()=>fixture());
  const result=await apply(p.id,await proposal(p.id));assert.equal(result.data.storyboard.scenes.length,6);
  assert.equal(audit.mock.callCount(),0);
  await assert.rejects(verifyStoryboards(c.db),/full metadata audit/);
 }finally{audit.mock.restore();}
});
test("fast planning guard rejects non-applied or changed migration receipts on every request",async()=>{
 const p=await create();const migrations=c.db.collection<{_id:string;state:string;checksum:string}>("schemaMigrations");
 for(const id of ["F09_0001_idea_proposals","F10_0001_storyboards"]){const original=(await migrations.findOne({_id:id}))!;
  try{await migrations.updateOne({_id:id},{$set:{state:"FAILED"}});await assert.rejects(admit(p.id));await migrations.updateOne({_id:id},{$set:{state:"APPLIED",checksum:"0".repeat(64)}});await assert.rejects(admit(p.id));}
  finally{await migrations.updateOne({_id:id},{$set:{state:original.state,checksum:original.checksum}});}
 }
 assert.equal(await c.db.collection("generationJobs").countDocuments({projectId:p.id}),0);
});
