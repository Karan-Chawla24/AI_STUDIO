import {prepareVoiceFixtures} from "./voice-fixtures";
import {admitIdeas,runIdea,decideProposal} from "../src/server/projects/ideas";
import {randomUUID} from "node:crypto";
import type {StoryboardProposal} from "../src/server/projects/storyboard-model";
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDatabase } from '../src/server/db/client';
import { migrateSettings } from '../src/server/projects/settings-schema';

import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
async function main() {
 const cleanVoices=prepareVoiceFixtures();
 const {chromium}=createRequire(process.cwd()+'/package.json')(process.env.PLAYWRIGHT_MODULE || 'playwright');
 const server=await MongoMemoryReplSet.create({binary:{version:'8.2.6'},replSet:{count:1}}); const connection=await connectDatabase({uri:server.getUri(),database:'studio_compile_browser',production:false}); await migrateSettings(connection.db);
 const origin='http://localhost:3111'; const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port','3111'],{env:{...process.env,NODE_ENV:'development',MONGODB_URI:server.getUri(),MONGODB_DB_NAME:'studio_compile_browser',APP_ORIGIN:origin,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),EMAIL_DELIVERY:'preview',GEMINI_API_KEY:'isolated-test-key',GEMINI_MODEL:'gemini-test'},windowsHide:true,stdio:['ignore','pipe','pipe']}); let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d); let browser;
 try {
  let ready=false; for(let i=0;i<100;i++){try{if((await fetch(origin+'/sign-in')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));} assert.ok(ready);
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1100}});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
  const account={name:'Library Creator',email:'library-browser@example.com',password:'Browser project password 42'};
  assert.equal((await page.request.post(origin+'/api/auth/sign-up/email',{headers:{Origin:origin},data:account})).status(),200);
  await page.goto(origin+'/sign-in');await page.getByLabel('Email address').fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/home');await page.getByRole('heading',{name:'Give your first idea a home.'}).waitFor();
  await page.goto(origin+'/projects/new');await page.getByLabel('Give your project a name').fill('Internet explained');await page.getByLabel('What do you want to explain?').fill('How a browser finds a website and receives the information from its server.');await page.getByRole('button',{name:'Create draft',exact:true}).click();await page.waitForURL(/\/projects\/[a-f0-9-]+$/);
  const projectUrl=page.url();const id=projectUrl.split('/').at(-1)!;



  const user=await connection.db.collection('user').findOne({email:account.email});const owner=String(user!._id);
  await connection.db.collection('user').updateOne({_id:user!._id},{$set:{emailVerified:true}});
  const output={title:'A request travels the internet',hook:'What happens when you open a website?',scenes:Array.from({length:6},(_,i)=>({narration:`Step ${i+1}: Your browser sends a request through the network. Routers help it find a server.`,visualDescription:'Browser and server joined by arrows.',motionDescription:'Reveal one packet travelling.',sceneType:i===0?'TITLE':'PROCESS_FLOW',captionHighlights:['browser']}))};
  const admission=await admitIdeas(connection,owner,id,'STORYBOARD_GENERATE',{expectedRevision:1,guidance:'',replaceExistingConfirmed:false},randomUUID(),true,'gemini-test');
  await runIdea(connection,String(admission.data.jobId),async()=>output);
  const proposal=(await connection.db.collection<StoryboardProposal>('proposals').findOne({sourceJobId:String(admission.data.jobId)}))!;
  await decideProposal(connection,owner,id,proposal._id,'apply',{expectedRevision:1,expectedVersion:1},randomUUID(),randomUUID());

  await page.reload();await page.getByRole('button',{name:'Compile storyboard',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Approve storyboard',exact:true}).isEnabled(),false);
  await page.getByLabel('Voice preset',{exact:true}).selectOption('INDIAN_MALE');
  await page.getByRole('button',{name:'Compile storyboard',exact:true}).click();await page.getByText('Storyboard queued…',{exact:true}).waitFor();
  const job=await connection.db.collection('generationJobs').findOne({projectId:id,kind:'STORYBOARD_COMPILE',state:'QUEUED'});assert.ok(job);
  await runIdea(connection,String(job._id),async()=>({scenes:Array.from({length:6},(_,i)=>({headline:'A request travels',labels:i===0?['The internet, explained']:['Browser','Network','Server']}))}));
  await page.getByText('Current storyboard · Version 2',{exact:true}).waitFor();await page.getByRole('button',{name:'Approve storyboard',exact:true}).click();await page.getByRole('heading',{name:'Approved snapshot',exact:true}).waitFor();
  assert.equal(await page.locator('.compiled-preview').count(),6);await page.reload();await page.getByRole('heading',{name:'Approved snapshot',exact:true}).waitFor();
  await page.getByRole('button',{name:'Revoke approval',exact:true}).click();await page.getByRole('heading',{name:'Ready for your review',exact:true}).waitFor();await page.getByRole('button',{name:'Approve storyboard',exact:true}).click();await page.getByRole('heading',{name:'Approved snapshot',exact:true}).waitFor();
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.locator('.compile-controls').screenshot({path:'../docs/implementation/F12-approval-mobile.png'});await page.locator('.compiled-preview').first().screenshot({path:'../docs/implementation/F12-layout-mobile.png'});
  await page.getByRole('button',{name:'Edit scene',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Revoke approval',exact:true}).isEnabled(),false);await page.getByLabel('Scene narration',{exact:true}).fill('A browser asks a server for the page.');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Current storyboard · Version 3',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Approve storyboard',exact:true}).isEnabled(),false);assert.equal(await page.getByRole('heading',{name:'Approved snapshot',exact:true}).count(),0);
  assert.deepEqual(errors,[]);const report={compileQueue:'passed',layoutPreviews:6,voiceSelection:'passed',approval:'passed',reload:'passed',revocation:'passed',editInvalidation:'passed',mobileWidths:[390,320],pageErrors:errors,provider:'injected deterministic provider',database:'isolated temporary replica set'};writeFileSync('../docs/implementation/F12-browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 } finally {await browser?.close();if(child.pid)try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}writeFileSync('../.local/F12-preview.log',logs);await connection.client.close();await server.stop();cleanVoices();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
