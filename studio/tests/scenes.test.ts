import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID} from "node:crypto";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import {connectDatabase,type DatabaseConnection} from "../src/server/db/client";
import {provisionProfile} from "../src/server/auth/profile";
import {migrateScenes,verifyScenes} from "../src/server/projects/scene-schema";
import {editStoryboard} from "../src/server/projects/scene-service";
import {patchScene,regenerateInput} from "../src/server/projects/scene-model";
import {migrateStoryboards,verifyStoryboards} from "../src/server/projects/storyboard-schema";
import {type StoryboardProposal,type Storyboard} from "../src/server/projects/storyboard-model";
import {createProject,readProject} from "../src/server/projects/service";
import {validateCreate} from "../src/server/projects/model";
import {admitIdeas,runIdea,decideProposal,cancelIdea} from "../src/server/projects/ideas";
import {ideasRequest} from "../src/server/projects/ideas-http";
import {csrfToken} from "../src/server/projects/http";
import {deleteProject,cleanDeletion} from "../src/server/projects/deletion";
import type {IdeaJob} from "../src/server/projects/ideas-model";
let server:MongoMemoryReplSet,c:DatabaseConnection;
const owner="story-owner",user={id:owner,name:"Story Test",email:"story@example.com",emailVerified:true,createdAt:new Date(),updatedAt:new Date()},config={origin:"http://localhost:3001",secure:false,secret:"a".repeat(40)};
const fixture=()=>({title:"The internet, explained",hook:"What happens after you tap a link?",scenes:Array.from({length:6},(_,i)=>({narration:`Step ${i+1}: Your browser sends a small request through the network. Each device helps that request reach the server and find its way back.`,visualDescription:"Show a browser connected to a server with a labelled arrow.",motionDescription:"Reveal the browser, then move a small packet along the arrow as the narration describes it.",sceneType:i===0?"TITLE":"PROCESS_FLOW",captionHighlights:["browser"]}))});
const create=async()=> (await createProject(c,owner,validateCreate({title:"Internet",originalIdea:"Explain the internet to beginners"}),randomUUID(),randomUUID())).data;
const admit=(id:string,revision=1,replace=false,key=randomUUID())=>admitIdeas(c,owner,id,"STORYBOARD_GENERATE",{expectedRevision:revision,guidance:"",replaceExistingConfirmed:replace},key,true,"gemini-test");
const proposal=async(id:string)=>(await c.db.collection<StoryboardProposal>("proposals").findOne({projectId:id,kind:"STORYBOARD"},{sort:{createdAt:-1}}))!;
const generate=async(id:string,revision=1,replace=false)=>{const a=await admit(id,revision,replace);await runIdea(c,String(a.data.jobId),async()=>fixture());return proposal(id);};
const apply=(id:string,p:StoryboardProposal,revision=p.baseRevision,key=randomUUID(),requestId=randomUUID())=>decideProposal(c,owner,id,p._id,"apply",{expectedVersion:p.version,expectedRevision:revision},key,requestId);
before(async()=>{server=await MongoMemoryReplSet.create({binary:{version:"8.2.6"},replSet:{count:1}});c=await connectDatabase({uri:server.getUri(),database:"studio_scene_test",production:false});await migrateStoryboards(c.db);const old=await c.db.collection("schemaMigrations").find({state:"APPLIED"}).toArray();await migrateScenes(c.db);for(const row of old)assert.equal((await c.db.collection("schemaMigrations").findOne({_id:row._id}))?.checksum,row.checksum);await provisionProfile(c.db,user);await provisionProfile(c.db,{...user,id:"story-other"});},{timeout:240000});
after(async()=>{await c?.client.close();await server?.stop();});


async function ready(){const p=await create(),q=await generate(p.id);const applied=await apply(p.id,q);return {id:p.id,story:applied.data.storyboard as ReturnType<typeof import('../src/server/projects/storyboard-model').storyboardDTO>};}
test('F11 migration preserves earlier checksums and full verification',async()=>{assert.equal(await migrateScenes(c.db),'already-applied');await verifyScenes(c.db);await verifyStoryboards(c.db);});
test('manual edits create immutable snapshots with stable IDs; no-op and replay do not add versions',async()=>{
 const {id,story}=await ready(),scene=story.scenes[0],key=randomUUID();
 const input={expectedRevision:2,narration:'A browser sends a request.',captionHighlights:['browser']};
 const result=await editStoryboard(c,owner,id,scene.sceneId,input,key,randomUUID());
 const updated=result.data.storyboard;assert.equal(result.data.project.revision,3);assert.equal(updated.version,2);assert.equal(updated.scenes[0].sceneId,scene.sceneId);assert.equal(updated.scenes[0].speechText,'A browser sends a request.');assert.deepEqual(updated.scenes.slice(1),story.scenes.slice(1));
 assert.equal((await c.db.collection<Storyboard>('storyboards').findOne({_id:story.id}))?.scenes[0].narration,scene.narration);
 assert.equal((await editStoryboard(c,owner,id,scene.sceneId,input,key,randomUUID())).replayed,true);
 const noop=await editStoryboard(c,owner,id,scene.sceneId,{...input,expectedRevision:3},randomUUID(),randomUUID());assert.equal(noop.data.project.revision,3);assert.equal(await c.db.collection('storyboards').countDocuments({projectId:id}),2);
 await editStoryboard(c,owner,id,null,{expectedRevision:3,title:'A new storyboard title'},randomUUID(),randomUUID());assert.equal((await readProject(c,owner,id)).revision,4);
});
test('speech override rules and invalid field/highlight checks',async()=>{
 const {id,story}=await ready(),scene=story.scenes[0];
 await assert.rejects(editStoryboard(c,owner,id,scene.sceneId,{expectedRevision:2,speechText:'No auto override'},randomUUID(),randomUUID()),{code:'VALIDATION_FAILED'});
 await assert.rejects(editStoryboard(c,owner,id,scene.sceneId,{expectedRevision:2,order:5},randomUUID(),randomUUID()),{code:'VALIDATION_FAILED'});
 const row=(await c.db.collection<Storyboard>('storyboards').findOne({_id:story.id}))!;
 const override=patchScene(row.scenes[0],{speechMode:'OVERRIDE',speechText:'Custom pronunciation.'});assert.equal(override.speechText,'Custom pronunciation.');assert.deepEqual(patchScene(override,{speechText:'  Custom pronunciation.  '}),override);
 assert.throws(()=>patchScene(override,{narration:'Changed words.',captionHighlights:[]}),{code:'VALIDATION_FAILED'});
 assert.equal(patchScene(override,{visualDescription:'Updated diagram'}).speechText,override.speechText);
 assert.equal(patchScene(override,{speechMode:'AUTO'}).speechText,override.narration.replace(/\s+/g,' '));
 assert.throws(()=>patchScene(override,{captionHighlights:['phrase absent']}),{code:'VALIDATION_FAILED'});
});
test('regeneration scopes preserve all non-target fields and require acceptance',async()=>{
 for(const scope of ['NARRATION','VISUALS','BOTH'] as const){const {id,story}=await ready(),scene=story.scenes[0];const input=regenerateInput({expectedRevision:2,scope},scene.sceneId);
 const receipt=await admitIdeas(c,owner,id,'SCENE_REGENERATE',input,randomUUID(),true,'gemini-test');
 const output={...(scope!=='VISUALS'?{narration:'A browser asks the server.',captionHighlights:['browser']}:{}),...(scope!=='NARRATION'?{visualDescription:'A browser and server diagram.',motionDescription:'Move one request.',sceneType:'DIAGRAM'}:{})};
 await runIdea(c,String(receipt.data.jobId),async()=>output);
 const q=await c.db.collection<import('../src/server/projects/storyboard-model').SceneProposal>('proposals').findOne({sourceJobId:String(receipt.data.jobId)});assert.ok(q);assert.equal(q.kind,'SCENE');assert.equal(q.targetSceneId,scene.sceneId);assert.equal((await readProject(c,owner,id)).revision,2);
 const result=await decideProposal(c,owner,id,q._id,'apply',{expectedRevision:2,expectedVersion:1},randomUUID(),randomUUID());const after=result.data.storyboard;
 assert.deepEqual(after.scenes.slice(1),story.scenes.slice(1));assert.equal(after.scenes[0].sceneId,scene.sceneId);
 if(scope==='VISUALS')assert.equal(after.scenes[0].narration,scene.narration);if(scope==='NARRATION')assert.equal(after.scenes[0].visualDescription,scene.visualDescription);
 assert.equal(after.version,2);assert.equal(result.data.project.revision,3);
 }
});
test('manual edit during regeneration produces a conflicted proposal; dismissal works',async()=>{
 const {id,story}=await ready(),scene=story.scenes[0];const r=await admitIdeas(c,owner,id,'SCENE_REGENERATE',regenerateInput({expectedRevision:2,scope:'NARRATION'},scene.sceneId),randomUUID(),true,'gemini-test');
 let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(r=>{entered=r;});const running=runIdea(c,String(r.data.jobId),async()=>{entered();await new Promise<void>(r=>{release=r;});return {narration:'New AI draft.',captionHighlights:[]};});await waiting;
 await editStoryboard(c,owner,id,scene.sceneId,{expectedRevision:2,narration:'My newer edit.',captionHighlights:[]},randomUUID(),randomUUID());release();await running;
 const q=await c.db.collection<import('../src/server/projects/storyboard-model').SceneProposal>('proposals').findOne({sourceJobId:String(r.data.jobId)});assert.ok(q);assert.equal(q.state,'CONFLICTED');
 assert.equal((await decideProposal(c,owner,id,q._id,'apply',{expectedRevision:3,expectedVersion:1},randomUUID(),randomUUID())).status,409);
 await decideProposal(c,owner,id,q._id,'dismiss',{expectedVersion:1},randomUUID(),randomUUID());assert.equal((await readProject(c,owner,id)).revision,3);
});
test('ownership, stale manual revision, missing scene and audit rollback',async(t)=>{
 const {id,story}=await ready(),patch={expectedRevision:2,title:'Changed'};
 await assert.rejects(editStoryboard(c,'story-other',id,null,patch,randomUUID(),randomUUID()),{code:'RESOURCE_NOT_FOUND'});
 await assert.rejects(editStoryboard(c,owner,id,null,{...patch,expectedRevision:1},randomUUID(),randomUUID()),{code:'REVISION_CONFLICT'});
 await assert.rejects(editStoryboard(c,owner,id,randomUUID(),{expectedRevision:2,narration:'Missing'},randomUUID(),randomUUID()),{code:'RESOURCE_NOT_FOUND'});
 const original=c.db.collection.bind(c.db);t.mock.method(c.db,'collection',((name:string,options?:import("mongodb").CollectionOptions)=>{const collection=original(name,options);if(name==='auditEvents')collection.insertOne=async()=>{throw new Error('audit failure');};return collection;}) as typeof c.db.collection);
 await assert.rejects(editStoryboard(c,owner,id,null,patch,randomUUID(),randomUUID()),/audit failure/);assert.equal((await readProject(c,owner,id)).activeStoryboardId,story.id);assert.equal(await c.db.collection('storyboards').countDocuments({projectId:id}),1);
});
test('scene cancellation and deletion fence regeneration',async()=>{
 for(const deleting of [false,true]){const {id,story}=await ready(),r=await admitIdeas(c,owner,id,'SCENE_REGENERATE',regenerateInput({expectedRevision:2,scope:'NARRATION'},story.scenes[0].sceneId),randomUUID(),true,'gemini-test');if(deleting){const d=await deleteProject(c,owner,id,{expectedRevision:2,confirmation:'DELETE_PROJECT'},randomUUID(),randomUUID());await cleanDeletion(c,d.data.deletionId);}else await cancelIdea(c,owner,id,String(r.data.jobId),1,randomUUID());let calls=0;await runIdea(c,String(r.data.jobId),async()=>{calls++;return {};});assert.equal(calls,0);assert.equal((await c.db.collection<IdeaJob>('generationJobs').findOne({_id:String(r.data.jobId)}))?.state,'CANCELLED');}
});
test('scene PATCH requires CSRF and scene regeneration requires verification',async()=>{
 const {id,story}=await ready(),profile=(await provisionProfile(c.db,user))!,identity={user,profile,sessionId:'scene-test'};
 const headers={Origin:config.origin,'Content-Type':'application/json','Idempotency-Key':randomUUID()};
 const bad=await ideasRequest(new Request(`${config.origin}/api/v1/projects/${id}/storyboard`,{method:'PATCH',headers,body:JSON.stringify({expectedRevision:2,title:'Changed'})}),id,['storyboard'],{connection:c,config,identity});assert.equal(bad.status,403);
 const unverified={...identity,user:{...user,emailVerified:false}};
 const response=await ideasRequest(new Request(`${config.origin}/api/v1/projects/${id}/scenes/${story.scenes[0].sceneId}/regenerate`,{method:'POST',headers:{...headers,'X-CSRF-Token':csrfToken(unverified,config.secret)},body:JSON.stringify({expectedRevision:2,scope:'BOTH'})}),id,['scenes',story.scenes[0].sceneId,'regenerate'],{connection:c,config,identity:unverified});assert.equal(response.status,403);
});

test('scene provider sends content context without internal IDs',async(t)=>{
 const {id,story}=await ready();
 const oldKey=process.env.GEMINI_API_KEY,oldModel=process.env.GEMINI_MODEL;process.env.GEMINI_API_KEY='fixture-key';process.env.GEMINI_MODEL='gemini-test';
 let subject='';t.mock.method(globalThis,'fetch',async(_url:unknown,init?:RequestInit)=>{subject=JSON.parse(String(init?.body)).contents[0].parts[0].text;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({visualDescription:'A diagram',motionDescription:'Reveal it',sceneType:'DIAGRAM'})}]}}]});});
 try{const {generateScene}=await import('../src/server/projects/scene-provider');await generateScene({title:'Internet',idea:'Explain requests',audience:null,niche:null,duration:75,count:1,guidance:'',model:'gemini-test',sceneContext:{storyboard:story,sceneId:story.scenes[0].sceneId,scope:'VISUALS'}});assert.ok(!subject.includes(id));assert.ok(!subject.includes(story.id));assert.ok(!subject.includes(story.scenes[0].sceneId));assert.equal(JSON.parse(subject).sceneIndex,0);assert.equal(JSON.parse(subject).scope,'VISUALS');}
 finally{if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;if(oldModel===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=oldModel;}
});
