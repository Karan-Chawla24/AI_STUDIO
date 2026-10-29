import {ideasRequest} from "../src/server/projects/ideas-http";
import type {Project} from "../src/server/projects/model";
import {migrateSettings,verifySettings} from "../src/server/projects/settings-schema";
import {updateSettings,settingsInput} from "../src/server/projects/settings";
import {catalog,voiceFingerprint} from "../src/server/catalog";
import {catalogRequest} from "../src/server/catalog-http";
import {csrfToken} from "../src/server/projects/http";
import {projectView} from "../src/server/projects/project-view";
import {prepareVoiceFixtures} from "./voice-fixtures";
import {migrateCompilation,verifyCompilation} from "../src/server/projects/compile-schema";
import {snapshotHash} from "../src/server/projects/compiler";

import {approvalCommand} from "../src/server/projects/approval";
import assert from "node:assert/strict";
import {before,after,beforeEach,test} from "node:test";
import {randomUUID} from "node:crypto";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import {connectDatabase,type DatabaseConnection} from "../src/server/db/client";
import {provisionProfile} from "../src/server/auth/profile";
import {migrateScenes} from "../src/server/projects/scene-schema";

import {migrateStoryboards} from "../src/server/projects/storyboard-schema";
import {type StoryboardProposal,type Storyboard} from "../src/server/projects/storyboard-model";
import {createProject,readProject} from "../src/server/projects/service";
import {validateCreate} from "../src/server/projects/model";
import {admitIdeas,runIdea,decideProposal} from "../src/server/projects/ideas";




let cleanupVoices:()=>void;
let server:MongoMemoryReplSet,c:DatabaseConnection;
const owner="story-owner",user={id:owner,name:"Story Test",email:"story@example.com",emailVerified:true,createdAt:new Date(),updatedAt:new Date()},config={origin:"http://localhost:3001",secure:false,secret:"a".repeat(40)};
const fixture=()=>({title:"The internet, explained",hook:"What happens after you tap a link?",scenes:Array.from({length:6},(_,i)=>({narration:`Step ${i+1}: Your browser sends a small request through the network. Each device helps that request reach the server and find its way back.`,visualDescription:"Show a browser connected to a server with a labelled arrow.",motionDescription:"Reveal the browser, then move a small packet along the arrow as the narration describes it.",sceneType:i===0?"TITLE":"PROCESS_FLOW",captionHighlights:["browser"]}))});
const create=async()=> (await createProject(c,owner,validateCreate({title:"Internet",originalIdea:"Explain the internet to beginners"}),randomUUID(),randomUUID())).data;
const admit=(id:string,revision=1,replace=false,key=randomUUID())=>admitIdeas(c,owner,id,"STORYBOARD_GENERATE",{expectedRevision:revision,guidance:"",replaceExistingConfirmed:replace},key,true,"gemini-test");
const proposal=async(id:string)=>(await c.db.collection<StoryboardProposal>("proposals").findOne({projectId:id,kind:"STORYBOARD"},{sort:{createdAt:-1}}))!;
const generate=async(id:string,revision=1,replace=false)=>{const a=await admit(id,revision,replace);await runIdea(c,String(a.data.jobId),async()=>fixture());return proposal(id);};
const apply=(id:string,p:StoryboardProposal,revision=p.baseRevision,key=randomUUID(),requestId=randomUUID())=>decideProposal(c,owner,id,p._id,"apply",{expectedVersion:p.version,expectedRevision:revision},key,requestId);
before(async()=>{cleanupVoices=prepareVoiceFixtures();server=await MongoMemoryReplSet.create({binary:{version:"8.2.6"},replSet:{count:1}});c=await connectDatabase({uri:server.getUri(),database:"studio_scene_test",production:false});await migrateStoryboards(c.db);const old=await c.db.collection("schemaMigrations").find({state:"APPLIED"}).toArray();await migrateScenes(c.db);await migrateSettings(c.db);for(const row of old)assert.equal((await c.db.collection("schemaMigrations").findOne({_id:row._id}))?.checksum,row.checksum);await provisionProfile(c.db,user);await provisionProfile(c.db,{...user,id:"story-other"});},{timeout:240000});
beforeEach(async()=>{await c.db.collection("generationJobs").updateMany({},{$set:{createdAt:new Date(Date.now()-7200000)}});});
after(async()=>{await c?.client.close();await server?.stop();cleanupVoices?.();});


async function ready(){const p=await create(),q=await generate(p.id);const applied=await apply(p.id,q);return {id:p.id,story:applied.data.storyboard as ReturnType<typeof import('../src/server/projects/storyboard-model').storyboardDTO>};}

const layouts=()=>({scenes:Array.from({length:6},(_,i)=>({headline:'Your browser',labels:i===0?['The internet']:['Browser','Network','Server']}))});
const compile=async(id:string,revision=2)=>{const r=await admitIdeas(c,owner,id,'STORYBOARD_COMPILE',{expectedRevision:revision,guidance:'',count:8},randomUUID(),true,'gemini-test');await runIdea(c,String(r.data.jobId),async()=>layouts());return readProject(c,owner,id);};
const voice=(id:string,revision:number,voiceKey='INDIAN_MALE')=>approvalCommand(c,owner,id,'voice',{expectedRevision:revision,voiceKey},randomUUID(),true,randomUUID());
const approve=(p:Awaited<ReturnType<typeof readProject>>,key=randomUUID())=>approvalCommand(c,owner,p._id,'approve',{expectedRevision:p.revision,storyboardId:p.activeStoryboardId,snapshotHash:p.currentSnapshotHash},key,true,randomUUID());

test('settings migration is repeatable and preserves previous checksums',async()=>{assert.equal(await migrateSettings(c.db),'already-applied');await verifySettings(c.db);await verifyCompilation(c.db);});
test('settings validation requires known fields, mandatory captions, no music and bounded duration',()=>{for(const patch of [{},{voiceKey:'raw-id'},{captionStyle:'OFF'},{captionStyle:null},{musicAssetId:'unlicensed'},{targetDurationSeconds:59},{targetDurationSeconds:90.5},{captionsEnabled:false},{ownerId:'other'}])assert.throws(()=>settingsInput({expectedRevision:1,...patch}),{code:'VALIDATION_FAILED'});assert.equal(settingsInput({expectedRevision:1,captionStyle:'HIGHLIGHTED',musicAssetId:null,targetDurationSeconds:90}).patch.captionStyle,'HIGHLIGHTED');});
test('settings persist, pin the selected voice, invalidate approval and preserve compiled scenes',async()=>{
 const {id}=await ready();let p=await compile(id);const oldStory=p.activeStoryboardId;const before=p.revision,key=randomUUID(),input={expectedRevision:before,voiceKey:'TEST_MALE',captionStyle:'HIGHLIGHTED',musicAssetId:null,targetDurationSeconds:80};
 const result=await updateSettings(c,owner,id,input,key,randomUUID());assert.equal(result.data.project.revision,before+1);assert.equal(result.data.project.settings.captionStyle,'HIGHLIGHTED');assert.equal(result.data.project.settings.voiceKey,'TEST_MALE');assert.equal(result.data.project.warnings[0].code,'PLAN_CHANGED');assert.equal((await updateSettings(c,owner,id,input,key,randomUUID())).replayed,true);
 p=await readProject(c,owner,id);await approve(p);p=await readProject(c,owner,id);const hash=p.currentSnapshotHash;await updateSettings(c,owner,id,{expectedRevision:p.revision,captionStyle:'BOLD'},randomUUID(),randomUUID());const changed=await readProject(c,owner,id);assert.equal(changed.approval,null);assert.notEqual(changed.currentSnapshotHash,hash);assert.equal(changed.activeStoryboardId,oldStory);const noop=await updateSettings(c,owner,id,{expectedRevision:changed.revision,captionStyle:'BOLD'},randomUUID(),randomUUID());assert.equal(noop.data.project.revision,changed.revision);
 await assert.rejects(updateSettings(c,owner,id,{expectedRevision:before,captionStyle:'CLEAN'},randomUUID(),randomUUID()),{code:'REVISION_CONFLICT'});await assert.rejects(updateSettings(c,'story-other',id,{expectedRevision:changed.revision,captionStyle:'CLEAN'},randomUUID(),randomUUID()),{code:'RESOURCE_NOT_FOUND'});
});
test('voice remapping disables mismatched sample and invalidates effective approval/hash',async()=>{
 const {id}=await ready();let p=await compile(id);await voice(id,p.revision);p=await readProject(c,owner,id);await approve(p);const saved=await readProject(c,owner,id),old=process.env.ELEVENLABS_INDIAN_MALE_ID;
 try{process.env.ELEVENLABS_INDIAN_MALE_ID='different-binding';assert.notEqual(snapshotHash((await c.db.collection<Storyboard>('storyboards').findOne({_id:p.activeStoryboardId!}))!,p.settings),p.currentSnapshotHash);const view=await projectView(c.db,saved);assert.equal(view.approval,null);assert.equal(view.creationStatus,'STORYBOARD_REVIEW');assert.equal(catalog().voices.find(v=>v.key==='INDIAN_MALE')?.available,false);await assert.rejects(updateSettings(c,owner,id,{expectedRevision:saved.revision,voiceKey:'INDIAN_MALE'},randomUUID(),randomUUID()),{code:'VOICE_UNAVAILABLE'});}finally{process.env.ELEVENLABS_INDIAN_MALE_ID=old;}
});
test('catalog exposes only logical choices and protects grants with auth, CSRF, session and ranges',async()=>{
 const profile=(await provisionProfile(c.db,user))!,identity={user,profile,sessionId:'preview-session'},deps={connection:c,identity,config};const endpoint=config.origin+'/api/v1/voices/TEST_MALE/preview-access';
 const publicCatalog=await catalogRequest(new Request(config.origin+'/api/v1/catalogs'),undefined,'catalog',deps);assert.equal(publicCatalog.status,200);const body=await publicCatalog.json();assert.equal(body.data.voices.length,4);assert.deepEqual(body.data.music,[]);assert.ok(!JSON.stringify(body).includes('fixture-'));assert.equal((await catalogRequest(new Request(config.origin+'/api/v1/catalogs'),undefined,'catalog',{...deps,identity:null})).status,401);
 const headers={Origin:config.origin,'Content-Type':'application/json','X-CSRF-Token':csrfToken(identity,config.secret)};
 assert.equal((await catalogRequest(new Request(endpoint,{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:'{}'}),'TEST_MALE','grant',deps)).status,403);
 assert.equal((await catalogRequest(new Request(endpoint,{method:'POST',headers,body:JSON.stringify({text:'arbitrary speech'})}),'TEST_MALE','grant',deps)).status,422);
 const grant=await catalogRequest(new Request(endpoint,{method:'POST',headers,body:'{}'}),'TEST_MALE','grant',deps);assert.equal(grant.status,200);const url=(await grant.json()).data.url;
 const audio=await catalogRequest(new Request(url,{headers:{Range:'bytes=0-9'}}),'TEST_MALE','sample',deps);assert.equal(audio.status,206);assert.equal((await audio.arrayBuffer()).byteLength,10);assert.equal(audio.headers.get('Content-Type'),'audio/mpeg');assert.equal((await catalogRequest(new Request(url,{headers:{Range:'bytes=999999-'}}),'TEST_MALE','sample',deps)).status,416);
 assert.equal((await catalogRequest(new Request(url),'TEST_MALE','sample',{...deps,identity:{...identity,sessionId:'other-session'}})).status,403);assert.equal((await catalogRequest(new Request(url.replace(/token=./,'token=0')),'TEST_MALE','sample',deps)).status,403);
 const binding=voiceFingerprint('TEST_MALE');const old=process.env.ELEVENLABS_TEST_MALE_ID;try{process.env.ELEVENLABS_TEST_MALE_ID='remapped';assert.notEqual(voiceFingerprint('TEST_MALE'),binding);assert.equal((await catalogRequest(new Request(url),'TEST_MALE','sample',deps)).status,409);}finally{process.env.ELEVENLABS_TEST_MALE_ID=old;}
});

test('F13 upgrade invalidates legacy approvals once without altering storyboard content',async()=>{
 const {id}=await ready();let p=await compile(id);await voice(id,p.revision);p=await readProject(c,owner,id);await approve(p);const before=await readProject(c,owner,id),story=(await c.db.collection<Storyboard>('storyboards').findOne({_id:before.activeStoryboardId!}))!;
 const upgraded={client:c.client,db:c.client.db('f13_upgrade_test')};await migrateCompilation(upgraded.db);await provisionProfile(upgraded.db,user);await upgraded.db.collection<Project>('projects').insertOne(before);await upgraded.db.collection<Storyboard>('storyboards').insertOne(story);
 await migrateSettings(upgraded.db);const after=await readProject(upgraded,owner,id);assert.equal(after.approval,null);assert.equal(after.revision,before.revision+1);assert.equal(after.activeStoryboardId,before.activeStoryboardId);assert.deepEqual(await upgraded.db.collection<Storyboard>('storyboards').findOne({_id:story._id}),story);
 await approvalCommand(upgraded,owner,id,'approve',{expectedRevision:after.revision,storyboardId:story._id,snapshotHash:snapshotHash(story,after.settings)},randomUUID(),true,randomUUID());const approved=await readProject(upgraded,owner,id);await migrateSettings(upgraded.db);assert.deepEqual(await readProject(upgraded,owner,id),approved);
});
test('settings audit failure rolls back content and idempotency receipt',async()=>{
 const {id}=await ready(),before=await readProject(c,owner,id);const schema=(await c.db.listCollections({name:'auditEvents'},{nameOnly:false}).next())!.options!.validator!;const blocked=structuredClone(schema);blocked.$jsonSchema.properties.action.enum=blocked.$jsonSchema.properties.action.enum.filter((v:string)=>v!=='PROJECT_SETTINGS_UPDATED');await c.db.command({collMod:'auditEvents',validator:blocked});
 try{await assert.rejects(updateSettings(c,owner,id,{expectedRevision:before.revision,captionStyle:'BOLD'},randomUUID(),randomUUID()));assert.deepEqual(await readProject(c,owner,id),before);}finally{await c.db.command({collMod:'auditEvents',validator:schema});}
});
test('settings HTTP protects mutations and resolves competing revisions',async()=>{
 const {id}=await ready();const profile=(await provisionProfile(c.db,user))!,identity={user,profile,sessionId:'settings-session'},deps={connection:c,identity,config},endpoint=config.origin+'/api/v1/projects/'+id+'/settings';const headers={Origin:config.origin,'Content-Type':'application/json','Idempotency-Key':randomUUID()};
 assert.equal((await ideasRequest(new Request(endpoint,{method:'PATCH',headers,body:JSON.stringify({expectedRevision:2,captionStyle:'BOLD'})}),id,['settings'],deps)).status,403);
 const good=await ideasRequest(new Request(endpoint,{method:'PATCH',headers:{...headers,'X-CSRF-Token':csrfToken(identity,config.secret)},body:JSON.stringify({expectedRevision:2,captionStyle:'BOLD'})}),id,['settings'],deps);assert.equal(good.status,200);
 const results=await Promise.allSettled(['CLEAN','HIGHLIGHTED'].map(captionStyle=>updateSettings(c,owner,id,{expectedRevision:3,captionStyle},randomUUID(),randomUUID())));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failure=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.equal(failure.reason.code,'REVISION_CONFLICT');
});
