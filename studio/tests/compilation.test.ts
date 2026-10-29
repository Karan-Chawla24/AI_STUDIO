import {prepareVoiceFixtures} from "./voice-fixtures";
import {migrateCompilation,verifyCompilation} from "../src/server/projects/compile-schema";
import {normalizeSpeech,snapshotHash,compileStoryboard} from "../src/server/projects/compiler";
import {storyboardDTO,storyboardHash} from "../src/server/projects/storyboard-model";
import {approvalCommand} from "../src/server/projects/approval";
import assert from "node:assert/strict";
import {before,after,beforeEach,test} from "node:test";
import {randomUUID} from "node:crypto";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import {connectDatabase,type DatabaseConnection} from "../src/server/db/client";
import {provisionProfile} from "../src/server/auth/profile";
import {migrateScenes,verifyScenes} from "../src/server/projects/scene-schema";
import {editStoryboard} from "../src/server/projects/scene-service";

import {migrateStoryboards} from "../src/server/projects/storyboard-schema";
import {type StoryboardProposal,type Storyboard} from "../src/server/projects/storyboard-model";
import {createProject,readProject} from "../src/server/projects/service";
import {validateCreate} from "../src/server/projects/model";
import {admitIdeas,runIdea,decideProposal,cancelIdea} from "../src/server/projects/ideas";
import {ideasRequest} from "../src/server/projects/ideas-http";


import type {IdeaJob} from "../src/server/projects/ideas-model";
let cleanupVoices:()=>void;
let server:MongoMemoryReplSet,c:DatabaseConnection;
const owner="story-owner",user={id:owner,name:"Story Test",email:"story@example.com",emailVerified:true,createdAt:new Date(),updatedAt:new Date()},config={origin:"http://localhost:3001",secure:false,secret:"a".repeat(40)};
const fixture=()=>({title:"The internet, explained",hook:"What happens after you tap a link?",scenes:Array.from({length:6},(_,i)=>({narration:`Step ${i+1}: Your browser sends a small request through the network. Each device helps that request reach the server and find its way back.`,visualDescription:"Show a browser connected to a server with a labelled arrow.",motionDescription:"Reveal the browser, then move a small packet along the arrow as the narration describes it.",sceneType:i===0?"TITLE":"PROCESS_FLOW",captionHighlights:["browser"]}))});
const create=async()=> (await createProject(c,owner,validateCreate({title:"Internet",originalIdea:"Explain the internet to beginners"}),randomUUID(),randomUUID())).data;
const admit=(id:string,revision=1,replace=false,key=randomUUID())=>admitIdeas(c,owner,id,"STORYBOARD_GENERATE",{expectedRevision:revision,guidance:"",replaceExistingConfirmed:replace},key,true,"gemini-test");
const proposal=async(id:string)=>(await c.db.collection<StoryboardProposal>("proposals").findOne({projectId:id,kind:"STORYBOARD"},{sort:{createdAt:-1}}))!;
const generate=async(id:string,revision=1,replace=false)=>{const a=await admit(id,revision,replace);await runIdea(c,String(a.data.jobId),async()=>fixture());return proposal(id);};
const apply=(id:string,p:StoryboardProposal,revision=p.baseRevision,key=randomUUID(),requestId=randomUUID())=>decideProposal(c,owner,id,p._id,"apply",{expectedVersion:p.version,expectedRevision:revision},key,requestId);
before(async()=>{cleanupVoices=prepareVoiceFixtures();server=await MongoMemoryReplSet.create({binary:{version:"8.2.6"},replSet:{count:1}});c=await connectDatabase({uri:server.getUri(),database:"studio_scene_test",production:false});await migrateStoryboards(c.db);const old=await c.db.collection("schemaMigrations").find({state:"APPLIED"}).toArray();await migrateScenes(c.db);await migrateCompilation(c.db);for(const row of old)assert.equal((await c.db.collection("schemaMigrations").findOne({_id:row._id}))?.checksum,row.checksum);await provisionProfile(c.db,user);await provisionProfile(c.db,{...user,id:"story-other"});},{timeout:240000});
beforeEach(async()=>{await c.db.collection("generationJobs").updateMany({},{$set:{createdAt:new Date(Date.now()-7200000)}});});
after(async()=>{await c?.client.close();await server?.stop();cleanupVoices?.();});


async function ready(){const p=await create(),q=await generate(p.id);const applied=await apply(p.id,q);return {id:p.id,story:applied.data.storyboard as ReturnType<typeof import('../src/server/projects/storyboard-model').storyboardDTO>};}

const layouts=()=>({scenes:Array.from({length:6},(_,i)=>({headline:'Your browser',labels:i===0?['The internet']:['Browser','Network','Server']}))});
const compile=async(id:string,revision=2)=>{const r=await admitIdeas(c,owner,id,'STORYBOARD_COMPILE',{expectedRevision:revision,guidance:'',count:8},randomUUID(),true,'gemini-test');await runIdea(c,String(r.data.jobId),async()=>layouts());return readProject(c,owner,id);};
const voice=(id:string,revision:number,voiceKey='INDIAN_MALE')=>approvalCommand(c,owner,id,'voice',{expectedRevision:revision,voiceKey},randomUUID(),true,randomUUID());
const approve=(p:Awaited<ReturnType<typeof readProject>>,key=randomUUID())=>approvalCommand(c,owner,p._id,'approve',{expectedRevision:p.revision,storyboardId:p.activeStoryboardId,snapshotHash:p.currentSnapshotHash},key,true,randomUUID());
test('F12 migration is repeatable with all older verification and index recovery protections',async()=>{assert.equal(await migrateCompilation(c.db),'already-applied');await verifyCompilation(c.db);await verifyScenes(c.db);});
test('compile installs immutable validated layouts, stable scene IDs and snapshot hash; voice and approval bind exact content',async()=>{
 const {id,story}=await ready();let p=await compile(id);const saved=(await c.db.collection<Storyboard>('storyboards').findOne({_id:p.activeStoryboardId!}))!;
 assert.equal(saved.compileState,'VALID');assert.equal(saved.version,2);assert.equal(saved.scenes[0].sceneId,story.scenes[0].sceneId);assert.ok(saved.scenes.every(s=>s.compiled));assert.ok(p.currentSnapshotHash);assert.equal((await c.db.collection<Storyboard>('storyboards').findOne({_id:story.id}))?.compileState,'NEEDS_COMPILATION');
 await assert.rejects(approve(p),{code:'APPROVAL_NOT_READY'});await voice(id,p.revision);p=await readProject(c,owner,id);const key=randomUUID();const result=await approve(p,key);assert.ok(result.data.project.approval);assert.equal((await approve(p,key)).replayed,true);
 const same=await admitIdeas(c,owner,id,'STORYBOARD_COMPILE',{expectedRevision:p.revision,guidance:'',count:8},randomUUID(),true,'gemini-test');assert.equal(same.status,200);assert.equal(same.data.reused,true);
 await voice(id,p.revision,'INDIAN_FEMALE');const changed=await readProject(c,owner,id);assert.equal(changed.approval,null);assert.notEqual(changed.currentSnapshotHash,p.currentSnapshotHash);await assert.rejects(approve(p),{code:'REVISION_CONFLICT'});
 await approve(changed);await editStoryboard(c,owner,id,null,{expectedRevision:changed.revision,title:'Updated story'},randomUUID(),randomUUID());const edited=await readProject(c,owner,id);assert.equal(edited.approval,null);assert.equal(edited.currentSnapshotHash,null);assert.equal(edited.statusProjection.creationStatus,'STORYBOARD_REVIEW');
});
test('invalid layout persists field feedback and blocks approval',async()=>{
 const {id}=await ready();const a=await admitIdeas(c,owner,id,'STORYBOARD_COMPILE',{expectedRevision:2,guidance:'',count:8},randomUUID(),true,'gemini-test');const output=layouts();output.scenes[1].labels=['Only one'];await runIdea(c,String(a.data.jobId),async()=>output);const p=await readProject(c,owner,id),s=await c.db.collection<Storyboard>('storyboards').findOne({_id:p.activeStoryboardId!});assert.equal(s?.compileState,'INVALID');assert.ok(s!.scenes[1].validationErrors.length);assert.equal(p.currentSnapshotHash,null);await assert.rejects(approve(p),{code:'APPROVAL_NOT_READY'});
});
test('successful edit during delayed compilation keeps newer content and stores a conflicted result',async()=>{
 const {id}=await ready();const a=await admitIdeas(c,owner,id,'STORYBOARD_COMPILE',{expectedRevision:2,guidance:'',count:8},randomUUID(),true,'gemini-test');await runIdea(c,String(a.data.jobId),async()=>{await editStoryboard(c,owner,id,null,{expectedRevision:2,title:'Newer content'},randomUUID(),randomUUID());return layouts();});const p=await readProject(c,owner,id);assert.equal(p.revision,3);assert.equal(p.currentSnapshotHash,null);const q=await c.db.collection('proposals').findOne({sourceJobId:a.data.jobId});assert.equal(q?.kind,'COMPILE');assert.equal(q?.state,'CONFLICTED');assert.equal((await decideProposal(c,owner,id,String(q!._id),'apply',{expectedVersion:1,expectedRevision:3},randomUUID(),randomUUID())).status,409);assert.equal((await readProject(c,owner,id)).revision,3);
});
test('cancelled compile discards result',async()=>{
 const {id,story}=await ready();const a=await admitIdeas(c,owner,id,'STORYBOARD_COMPILE',{expectedRevision:2,guidance:'',count:8},randomUUID(),true,'gemini-test');await runIdea(c,String(a.data.jobId),async()=>{const job=await c.db.collection<IdeaJob>('generationJobs').findOne({_id:String(a.data.jobId)});await cancelIdea(c,owner,id,job!._id,job!.resourceVersion,randomUUID());return layouts();});assert.equal((await readProject(c,owner,id)).activeStoryboardId,story.id);assert.equal((await c.db.collection<IdeaJob>('generationJobs').findOne({_id:String(a.data.jobId)}))?.state,'CANCELLED');
});
test('approval rejects foreign ownership, unverified users, mismatched hash and missing CSRF',async()=>{
 const {id}=await ready();let p=await compile(id);await voice(id,p.revision);p=await readProject(c,owner,id);const input={expectedRevision:p.revision,storyboardId:p.activeStoryboardId,snapshotHash:p.currentSnapshotHash};await assert.rejects(approvalCommand(c,'story-other',id,'approve',input,randomUUID(),true,randomUUID()),{code:'RESOURCE_NOT_FOUND'});await assert.rejects(approvalCommand(c,owner,id,'approve',input,randomUUID(),false,randomUUID()),{code:'EMAIL_NOT_VERIFIED'});await assert.rejects(approvalCommand(c,owner,id,'approve',{...input,snapshotHash:'f'.repeat(64)},randomUUID(),true,randomUUID()),{code:'APPROVAL_NOT_READY'});
 const profile=(await provisionProfile(c.db,user))!,identity={user,profile,sessionId:'compile-test'};const r=await ideasRequest(new Request(config.origin+'/api/v1/projects/'+id+'/approval',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(input)}),id,['approval'],{connection:c,config,identity});assert.equal(r.status,403);
 await approve(p);await approvalCommand(c,owner,id,'revoke',{expectedRevision:p.revision},randomUUID(),true,randomUUID());assert.equal((await readProject(c,owner,id)).approval,null);
});

test('compiler rejects unsafe layouts, normalizes speech, maps all four templates and produces stable hashes',async()=>{
 assert.equal(normalizeSpeech('An API uses HTTP and DNS.'),'An A P I uses H T T P and D N S.');const {story}=await ready();story.scenes[2].sceneType='DIAGRAM';story.scenes[3].sceneType='GENERIC_EDITORIAL';const output=layouts();const compiled=compileStoryboard(story,output);assert.equal(compiled.compileState,'VALID');assert.equal(compiled.scenes[2].compiledPreview?.preview.type,'DIAGRAM');assert.equal(compiled.scenes[3].compiledPreview?.preview.type,'GENERIC_EDITORIAL');assert.deepEqual(compiled.scenes.map(s=>s.sceneId),story.scenes.map(s=>s.sceneId));
 const settings={voiceKey:'INDIAN_MALE' as const,captionStyle:'CLEAN' as const,musicAssetId:null,targetDurationSeconds:75};assert.equal(snapshotHash(compiled,settings),snapshotHash({...compiled,contentHash:compiled.contentHash},settings));output.scenes[2].labels=['<script>','Server'];assert.equal(compileStoryboard(story,output).compileState,'INVALID');
 const {id}=await ready();await compile(id);const p=await readProject(c,owner,id);const row=(await c.db.collection<Storyboard>('storyboards').findOne({_id:p.activeStoryboardId!}))!;assert.equal(storyboardHash(row),row.contentHash);const dto=storyboardDTO(row);const noop=await editStoryboard(c,owner,id,dto.scenes[0].sceneId,{expectedRevision:p.revision,narration:dto.scenes[0].narration},randomUUID(),randomUUID());assert.equal(noop.data.project.revision,p.revision);
});

test('normalization overflow is actionable invalid feedback, not a database write failure',async()=>{
 const {id,story}=await ready();await editStoryboard(c,owner,id,story.scenes[0].sceneId,{expectedRevision:2,narration:'API '.repeat(290).trim(),captionHighlights:[]},randomUUID(),randomUUID());const p=await compile(id,3),row=await c.db.collection<Storyboard>('storyboards').findOne({_id:p.activeStoryboardId!});assert.equal(row?.compileState,'INVALID');assert.equal(row?.scenes[0].validationErrors[0].code,'LAYOUT_INVALID');assert.ok(row!.scenes[0].speechText.length<=1200);
});

test('canonical no-op edits preserve compiled speech, layout, approval and revisions',async()=>{
 const {id,story}=await ready();const sceneId=story.scenes[0].sceneId;
 await editStoryboard(c,owner,id,sceneId,{expectedRevision:2,narration:'An API serves a café.',captionHighlights:['API','café']},randomUUID(),randomUUID());
 let p=await compile(id,3);await voice(id,p.revision);p=await readProject(c,owner,id);await approve(p);const before=await readProject(c,owner,id);
 const snapshot=(await c.db.collection<Storyboard>('storyboards').findOne({_id:before.activeStoryboardId!}))!,scene=snapshot.scenes[0];assert.equal(scene.speechText,'An A P I serves a café.');assert.ok(scene.compiled);
 const variants=[{narration:'  An API serves a cafe\u0301.  '},{visualDescription:' '+scene.visualDescription+' '},{motionDescription:'\n'+scene.motionDescription+'\n'},{captionHighlights:[' API ',' cafe\u0301 ']},{speechMode:'AUTO',narration:' '+scene.narration+' ',visualDescription:' '+scene.visualDescription+' ',motionDescription:' '+scene.motionDescription+' ',captionHighlights:[' API ',' cafe\u0301 '],sceneType:scene.sceneType}];
 for(const patch of variants){await editStoryboard(c,owner,id,sceneId,{expectedRevision:before.revision,...patch},randomUUID(),randomUUID());assert.deepEqual(await readProject(c,owner,id),before);assert.deepEqual(await c.db.collection<Storyboard>('storyboards').findOne({_id:before.activeStoryboardId!}),snapshot);}
 assert.equal(await c.db.collection('storyboards').countDocuments({projectId:id}),3);
 await editStoryboard(c,owner,id,sceneId,{expectedRevision:before.revision,narration:'An API serves a different café.'},randomUUID(),randomUUID());const changed=await readProject(c,owner,id);assert.equal(changed.revision,before.revision+1);assert.equal(changed.approval,null);assert.equal(changed.currentSnapshotHash,null);
});
