import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID} from "node:crypto";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import {connectDatabase,type DatabaseConnection} from "../src/server/db/client";
import {provisionProfile} from "../src/server/auth/profile";
import {migrateIdeas,verifyIdeas} from "../src/server/projects/ideas-schema";
import {createProject,readProject} from "../src/server/projects/service";
import {validateCreate} from "../src/server/projects/model";
import {ideaCommand,admitIdeas,runIdea,decideProposal,cancelIdea,drainIdeas} from "../src/server/projects/ideas";
import {ideaInput,validateIdeas,type IdeaJob,type Proposal} from "../src/server/projects/ideas-model";
import {updatePlan} from "../src/server/projects/plan";
import {deleteProject,cleanDeletion} from "../src/server/projects/deletion";
import {ideaList,ideasRequest} from "../src/server/projects/ideas-http";
import {csrfToken} from "../src/server/projects/http";
let server:MongoMemoryReplSet,c:DatabaseConnection;
const owner="ideas-owner",user={id:owner,name:"Ideas Tester",email:"ideas@example.com",emailVerified:true,createdAt:new Date(),updatedAt:new Date()},config={origin:"http://localhost:3001",secure:false,secret:"a".repeat(40)};
const create=async()=> (await createProject(c,owner,validateCreate({title:"Internet",originalIdea:"How the internet works"}),randomUUID(),randomUUID())).data;
const admission=(id:string,key=randomUUID())=>admitIdeas(c,owner,id,"IDEA_REFINE",{expectedRevision:1,count:1,guidance:""},key,true,"gemini-test");
const fake=async()=>({ideas:[{title:"A packet’s journey",refinedIdea:"Follow one packet from browser to server.",rationale:"Makes the network tangible."}]});
const proposal=async(id:string)=>(await c.db.collection<Proposal>("proposals").findOne({projectId:id}))!;
before(async()=>{server=await MongoMemoryReplSet.create({binary:{version:"8.2.6"},replSet:{count:1}});c=await connectDatabase({uri:server.getUri(),database:"studio_ideas_test",production:false});await migrateIdeas(c.db);await provisionProfile(c.db,user);await provisionProfile(c.db,{...user,id:"ideas-other"});},{timeout:240000});
after(async()=>{await c?.client.close();await server?.stop();});
test("migration repeatability and strict validation",async()=>{assert.equal(await migrateIdeas(c.db),"already-applied");await verifyIdeas(c.db);for(const x of [{expectedRevision:1,count:0},{expectedRevision:1,count:11},{expectedRevision:1,guidance:"x".repeat(1001)},{expectedRevision:1,ownerId:"x"}])assert.throws(()=>ideaInput(x,false));assert.throws(()=>validateIdeas({ideas:[]},1));assert.throws(()=>validateIdeas({ideas:[{title:"x",refinedIdea:"y",rationale:"z",ownerId:owner}]},1));});
test("verified admission, ownership, idempotency and active reservation",async()=>{const p=await create();await assert.rejects(admitIdeas(c,owner,p.id,"IDEA_REFINE",{expectedRevision:1,count:1,guidance:""},randomUUID(),false,"gemini-test"),{code:"EMAIL_NOT_VERIFIED"});const key=randomUUID(),r=await admission(p.id,key);assert.equal((await admission(p.id,key)).data.jobId,r.data.jobId);await assert.rejects(admission(p.id),{code:"PROJECT_BUSY"});await assert.rejects(admitIdeas(c,"ideas-other",p.id,"IDEA_REFINE",{expectedRevision:1,count:1,guidance:""},randomUUID(),true,"gemini-test"),{code:"RESOURCE_NOT_FOUND"});await assert.rejects(admitIdeas(c,owner,p.id,"IDEA_REFINE",{expectedRevision:1,count:1,guidance:"new"},key,true,"gemini-test"),{code:"IDEMPOTENCY_CONFLICT"});await runIdea(c,String(r.data.jobId),fake);});
test("concurrent workers send once and explicit acceptance increments revision once",async()=>{const p=await create(),r=await admission(p.id);let calls=0;const provider=async()=>{calls++;return fake();};await Promise.all([runIdea(c,String(r.data.jobId),provider),runIdea(c,String(r.data.jobId),provider)]);assert.equal(calls,1);assert.equal((await readProject(c,owner,p.id)).revision,1);const q=await proposal(p.id),key=randomUUID(),input={expectedVersion:1,expectedRevision:1,selectedIdeaId:q.payload.ideas[0].id};const result=await decideProposal(c,owner,p.id,q._id,"apply",input,key,randomUUID());assert.equal(result.data.project.revision,2);assert.equal((await decideProposal(c,owner,p.id,q._id,"apply",input,key,randomUUID())).data.project.revision,2);});
test("stale application persists conflict and preserves manual edits",async()=>{const p=await create(),r=await admission(p.id);await runIdea(c,String(r.data.jobId),fake);const q=await proposal(p.id);await updatePlan(c,owner,p.id,{expectedRevision:1,title:"Manual title"},randomUUID());assert.equal((await decideProposal(c,owner,p.id,q._id,"apply",{expectedVersion:1,expectedRevision:2,selectedIdeaId:q.payload.ideas[0].id},randomUUID(),randomUUID())).status,409);assert.equal((await proposal(p.id)).state,"CONFLICTED");assert.equal((await readProject(c,owner,p.id)).title,"Manual title");await decideProposal(c,owner,p.id,q._id,"dismiss",{expectedVersion:2},randomUUID(),randomUUID());});
test("bad output fails; uncertain delivery holds reservation and sanitizes errors",async()=>{const p=await create(),r=await admission(p.id);await runIdea(c,String(r.data.jobId),async()=>({ideas:[]}));assert.equal(await proposal(p.id),null);const p2=await create(),r2=await admission(p2.id);await runIdea(c,String(r2.data.jobId),async()=>{throw new Error("secret raw provider failure");});const j=await c.db.collection<IdeaJob>("generationJobs").findOne({_id:String(r2.data.jobId)});assert.equal(j?.state,"REQUIRES_ATTENTION");assert.equal(j?.active,true);assert.ok(!JSON.stringify(j?.error).includes("secret"));await assert.rejects(admission(p2.id),{code:"PROJECT_BUSY"});});
test("cancellation spends nothing; deletion fences delayed provider completion and purges input",async()=>{const p=await create(),r=await admission(p.id);await cancelIdea(c,owner,p.id,String(r.data.jobId),1,randomUUID());let calls=0;await runIdea(c,String(r.data.jobId),async()=>{calls++;return fake();});assert.equal(calls,0);const p2=await create(),r2=await admission(p2.id);let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(r=>{entered=r;});const running=runIdea(c,String(r2.data.jobId),async()=>{entered();await new Promise<void>(r=>{release=r;});return fake();});await waiting;const d=await deleteProject(c,owner,p2.id,{expectedRevision:1,confirmation:"DELETE_PROJECT"},randomUUID(),randomUUID());await cleanDeletion(c,d.data.deletionId);release();await running;assert.equal(await proposal(p2.id),null);assert.equal((await c.db.collection<IdeaJob>("generationJobs").findOne({_id:String(r2.data.jobId)}))?.input,null);});
test("expired lease never resends",async()=>{const p=await create(),r=await admission(p.id);await c.db.collection<IdeaJob>("generationJobs").updateOne({_id:String(r.data.jobId)},{$set:{state:"RUNNING",stage:"PLANNING","lease.expiresAt":new Date(0)}});let calls=0;await drainIdeas(c,async()=>{calls++;return fake();});assert.equal(calls,0);assert.equal((await c.db.collection<IdeaJob>("generationJobs").findOne({_id:String(r.data.jobId)}))?.state,"REQUIRES_ATTENTION");});
test("signed pagination binds limit and owner",async()=>{const p=await create();for(let i=0;i<3;i++){const r=await admission(p.id);await runIdea(c,String(r.data.jobId),fake);}const page=await ideaList(c,owner,p.id,"proposals",new URLSearchParams({limit:"1"}),config.secret);assert.ok(page.page.nextCursor);const next=await ideaList(c,owner,p.id,"proposals",new URLSearchParams({limit:"1",cursor:page.page.nextCursor!}),config.secret);assert.notEqual(next.items[0].id,page.items[0].id);await assert.rejects(ideaList(c,owner,p.id,"proposals",new URLSearchParams({limit:"2",cursor:page.page.nextCursor!}),config.secret),{code:"INVALID_QUERY"});});
test("HTTP session, CSRF, verification and duplicate-key JSON",async()=>{const p=await create(),profile=(await provisionProfile(c.db,user))!,identity={user,profile,sessionId:"idea-session"};const send=(body:string,extra:Record<string,string>={},auth=true,verified=true)=>ideasRequest(new Request(`${config.origin}/api/v1/projects/${p.id}/ideas/refine`,{method:"POST",headers:{Origin:config.origin,"Content-Type":"application/json","X-CSRF-Token":csrfToken(identity,config.secret),"Idempotency-Key":randomUUID(),...extra},body}),p.id,["ideas","refine"],{connection:c,config,identity:auth?{...identity,user:{...user,emailVerified:verified}}:null});assert.equal((await send('{"expectedRevision":1}',{},false)).status,401);assert.equal((await send('{"expectedRevision":1}',{"X-CSRF-Token":"bad"})).status,403);assert.equal((await send('{"expectedRevision":1}',{},true,false)).status,403);assert.equal((await send('{"expectedRevision":1,"expectedRevision":2}')).status,400);});

test("receipt insert failure rolls back the command transaction",async()=>{
 const p=await create();
 await assert.rejects(ideaCommand(c,owner,p.id,`/api/v1/projects/${p.id}/ideas/refine`,randomUUID(),{},async(project,session)=>{
  await c.db.collection("projects").updateOne({_id:p.id as never},{$set:{title:"Must roll back"}},{session});
  return {data:{},status:999,operationId:p.id};
 }));
 assert.equal((await readProject(c,owner,p.id)).title,"Internet");
});
test("hourly quota is enforced across projects under the owner transaction fence",async()=>{
 const quotaOwner="quota-owner";await provisionProfile(c.db,{...user,id:quotaOwner});
 const p=(await createProject(c,quotaOwner,validateCreate({title:"Quota",originalIdea:"A bounded test"}),randomUUID(),randomUUID())).data;
 for(let i=0;i<20;i++){const r=await admitIdeas(c,quotaOwner,p.id,"IDEA_REFINE",{expectedRevision:1,count:1,guidance:""},randomUUID(),true,"gemini-test");await cancelIdea(c,quotaOwner,p.id,String(r.data.jobId),1,randomUUID());}
 await assert.rejects(admitIdeas(c,quotaOwner,p.id,"IDEA_REFINE",{expectedRevision:1,count:1,guidance:""},randomUUID(),true,"gemini-test"),{code:"RATE_LIMITED"});
});
test("editing during provider work produces a conflicted proposal, never an overwrite",async()=>{
 const p=await create(),r=await admission(p.id);let release!:()=>void,entered!:()=>void;
 const waiting=new Promise<void>(resolve=>{entered=resolve;});
 const running=runIdea(c,String(r.data.jobId),async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});return fake();});
 await waiting;await updatePlan(c,owner,p.id,{expectedRevision:1,refinedIdea:"Newer manual explanation"},randomUUID());release();await running;
 assert.equal((await proposal(p.id)).state,"CONFLICTED");assert.equal((await readProject(c,owner,p.id)).refinedIdea,"Newer manual explanation");
 assert.equal((await c.db.collection<IdeaJob>("generationJobs").findOne({_id:String(r.data.jobId)}))?.state,"SUPERSEDED");
});
