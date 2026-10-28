import {admitIdeas,runIdea,decideProposal} from "../src/server/projects/ideas";
import {randomUUID} from "node:crypto";
import type {StoryboardProposal} from "../src/server/projects/storyboard-model";
/* eslint-disable @typescript-eslint/no-explicit-any -- Browser harness loads externally supplied Playwright at runtime. */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDatabase } from '../src/server/db/client';
import { migrateScenes } from '../src/server/projects/scene-schema';

import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
async function main() {
 const {chromium}=createRequire(process.cwd()+'/package.json')(process.env.PLAYWRIGHT_MODULE || 'playwright');
 const server=await MongoMemoryReplSet.create({binary:{version:'8.2.6'},replSet:{count:1}}); const connection=await connectDatabase({uri:server.getUri(),database:'studio_scene_browser',production:false}); await migrateScenes(connection.db);
 const origin='http://localhost:3110'; const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port','3110'],{env:{...process.env,NODE_ENV:'development',MONGODB_URI:server.getUri(),MONGODB_DB_NAME:'studio_scene_browser',APP_ORIGIN:origin,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),EMAIL_DELIVERY:'preview',GEMINI_API_KEY:'isolated-test-key',GEMINI_MODEL:'gemini-test'},windowsHide:true,stdio:['ignore','pipe','pipe']}); let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d); let browser;
 try {
  let ready=false; for(let i=0;i<100;i++){try{if((await fetch(origin+'/sign-in')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));} assert.ok(ready);
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1100}});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
  const account={name:'Library Creator',email:'library-browser@example.com',password:'Browser project password 42'};
  assert.equal((await page.request.post(origin+'/api/auth/sign-up/email',{headers:{Origin:origin},data:account})).status(),200);
  await page.goto(origin+'/sign-in');await page.getByLabel('Email address').fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/home');await page.getByRole('heading',{name:'Give your first idea a home.'}).waitFor();
  await page.goto(origin+'/projects/new');await page.getByLabel('Give your project a name').fill('Internet explained');await page.getByLabel('What do you want to explain?').fill('How a browser finds a website and receives the information from its server.');await page.getByRole('button',{name:'Create draft',exact:true}).click();await page.waitForURL(/\/projects\/[a-f0-9-]+$/);
  const projectUrl=page.url();const id=projectUrl.split('/').at(-1)!;


  const api=origin+'/api/v1/projects/'+id;
  const user=await connection.db.collection('user').findOne({email:account.email});const owner=String(user!._id);
  await connection.db.collection('user').updateOne({_id:user!._id},{$set:{emailVerified:true}});
  const output={title:'A request travels the internet',hook:'What happens when you open a website?',scenes:Array.from({length:6},(_,i)=>({narration:`Step ${i+1}: Your browser sends a request through the network. Routers help it find a server.`,visualDescription:'Browser and server joined by arrows.',motionDescription:'Reveal one packet travelling.',sceneType:i===0?'TITLE':'PROCESS_FLOW',captionHighlights:['browser']}))};
  const admission=await admitIdeas(connection,owner,id,'STORYBOARD_GENERATE',{expectedRevision:1,guidance:'',replaceExistingConfirmed:false},randomUUID(),true,'gemini-test');
  await runIdea(connection,String(admission.data.jobId),async()=>output);
  const proposal=(await connection.db.collection<StoryboardProposal>('proposals').findOne({sourceJobId:String(admission.data.jobId)}))!;
  await decideProposal(connection,owner,id,proposal._id,'apply',{expectedRevision:1,expectedVersion:1},randomUUID(),randomUUID());
  await page.reload();await page.getByRole('button',{name:'Edit scene',exact:true}).click();
  await page.getByLabel('Scene narration',{exact:true}).fill('A browser asks a server for a page.');
  await page.getByLabel('Caption highlights (one phrase per line)',{exact:true}).fill('browser');
  // Hold the committed edit acknowledgement: retry must use the same key and create one version.
  let first=true;const keys:string[]=[];
  await page.route('**/api/v1/projects/'+id+'/scenes/*',async(route:any)=>{if(route.request().method()!=='PATCH'){await route.continue();return;}keys.push(route.request().headers()['idempotency-key']);if(first){first=false;const response=await route.fetch();await new Promise(r=>setTimeout(r,16000));try{await route.fulfill({response});}catch{}}else await route.continue();});
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Current storyboard · Version 2',{exact:true}).waitFor({timeout:35000});assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
  assert.equal(await connection.db.collection('storyboards').countDocuments({projectId:id}),2);await page.unroute('**/api/v1/projects/'+id+'/scenes/*');
  await page.reload();await page.getByRole('button',{name:'Edit scene',exact:true}).click();assert.equal(await page.getByLabel('Scene narration',{exact:true}).inputValue(),'A browser asks a server for a page.');
  await page.getByLabel('Speech mode',{exact:true}).selectOption('OVERRIDE');await page.getByLabel('Speech text',{exact:true}).fill('A browser asks a server for a payj.');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Current storyboard · Version 3',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit title and hook',exact:true}).click();await page.getByLabel('Storyboard title',{exact:true}).fill('My saved storyboard');
  // Concurrent save through the same authenticated API causes a conflict without dropping the local draft.
  const csrf=(await (await page.request.get(origin+'/api/v1/csrf')).json()).data.token;const remote=await page.request.patch(api+'/storyboard',{headers:{Origin:origin,'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()},data:{expectedRevision:4,hook:'A concurrent hook update'}});assert.equal(remote.status(),200);
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('button',{name:'Load latest for comparison'}).waitFor();assert.equal(await page.getByLabel('Storyboard title',{exact:true}).inputValue(),'My saved storyboard');await page.getByRole('button',{name:'Load latest for comparison'}).click();await page.getByRole('button',{name:'Keep my edits against latest version'}).click();await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Current storyboard · Version 5',{exact:true}).waitFor();
  await page.getByLabel('Regenerate',{exact:true}).selectOption('VISUALS');await page.getByRole('button',{name:'Regenerate selected scene'}).click();await page.getByText('Storyboard queued…',{exact:true}).waitFor();
  const job=await connection.db.collection('generationJobs').findOne({projectId:id,kind:'SCENE_REGENERATE',state:'QUEUED'});assert.ok(job);await runIdea(connection,String(job._id),async()=>({visualDescription:'Two devices connected with a clear blue arrow.',motionDescription:'Move a packet from left to right.',sceneType:'DIAGRAM'}));
  await page.getByRole('button',{name:'Use this scene',exact:true}).waitFor();await page.getByRole('heading',{name:'Current scene',exact:true}).waitFor();await page.getByRole('heading',{name:'Proposed scene',exact:true}).waitFor();
  assert.equal(await connection.db.collection('storyboards').countDocuments({projectId:id}),5);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.getByRole('button',{name:'Use this scene',exact:true}).click();await page.getByText('Current storyboard · Version 6',{exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Edit scene',exact:true}).click();assert.equal(await page.getByLabel('Speech text',{exact:true}).inputValue(),'A browser asks a server for a payj.');assert.equal(await page.getByLabel('Visual description',{exact:true}).inputValue(),'Two devices connected with a clear blue arrow.');
  await page.screenshot({path:'../docs/implementation/F11-scene-editor-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);const report={manualEdit:'passed',lostEditAcknowledgement:'same-key replay, one version',overridePersistence:'passed',conflictDraftPreserved:'passed',scopedRegenerationComparison:'passed',explicitAcceptance:'passed',mobileWidths:[390,320],pageErrors:errors,provider:'injected deterministic provider',database:'isolated temporary replica set'};writeFileSync('../docs/implementation/F11-browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 } finally {await browser?.close();if(child.pid)try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}writeFileSync('../.local/F11-preview.log',logs);await connection.client.close();await server.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
