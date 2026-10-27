/* eslint-disable @typescript-eslint/no-explicit-any -- Browser harness loads externally supplied Playwright at runtime. */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDatabase } from '../src/server/db/client';
import { migrateStoryboards } from '../src/server/projects/storyboard-schema';

import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
async function main() {
 const {chromium}=createRequire(process.cwd()+'/package.json')(process.env.PLAYWRIGHT_MODULE || 'playwright');
 const server=await MongoMemoryReplSet.create({binary:{version:'8.2.6'},replSet:{count:1}}); const connection=await connectDatabase({uri:server.getUri(),database:'studio_refresh_browser',production:false}); await migrateStoryboards(connection.db);
 const origin='http://localhost:3109'; const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port','3109'],{env:{...process.env,NODE_ENV:'development',MONGODB_URI:server.getUri(),MONGODB_DB_NAME:'studio_refresh_browser',APP_ORIGIN:origin,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),EMAIL_DELIVERY:'preview',GEMINI_API_KEY:'isolated-test-key',GEMINI_MODEL:'gemini-test'},windowsHide:true,stdio:['ignore','pipe','pipe']}); let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d); let browser;
 try {
  let ready=false; for(let i=0;i<100;i++){try{if((await fetch(origin+'/sign-in')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));} assert.ok(ready);
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1100}});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
  const account={name:'Library Creator',email:'library-browser@example.com',password:'Browser project password 42'};
  assert.equal((await page.request.post(origin+'/api/auth/sign-up/email',{headers:{Origin:origin},data:account})).status(),200);
  await page.goto(origin+'/sign-in');await page.getByLabel('Email address').fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/home');await page.getByRole('heading',{name:'Give your first idea a home.'}).waitFor();
  await page.goto(origin+'/projects/new');await page.getByLabel('Give your project a name').fill('Internet explained');await page.getByLabel('What do you want to explain?').fill('How a browser finds a website and receives the information from its server.');await page.getByRole('button',{name:'Create draft',exact:true}).click();await page.waitForURL(/\/projects\/[a-f0-9-]+$/);
  const projectUrl=page.url();const id=projectUrl.split('/').at(-1)!;

  const api=origin+'/api/v1/projects/'+id;
  const original=(await (await page.request.get(api)).json()).data;
  let release!:()=>void,started!:()=>void;
  const blocked=new Promise<void>(resolve=>{started=resolve;});
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let first=true;
  await page.route(api+'/storyboards',async(route:any)=>{
   if(!first){await route.continue();return;}first=false;
   const response=await route.fetch();started();await gate;await route.fulfill({response});
  });
  await page.reload();await blocked;
  const newer='An updated explanation saved while the storyboard refresh is still loading.';
  await page.getByLabel('Your plan',{exact:true}).fill(newer);
  await page.getByRole('status').filter({hasText:'All changes saved'}).waitFor();
  await page.getByText('Revision 2',{exact:true}).waitFor();
  release();await page.waitForTimeout(700);
  assert.equal(await page.getByLabel('Your plan',{exact:true}).inputValue(),newer);
  assert.equal((await (await page.request.get(api)).json()).data.revision,2);
  await page.unroute(api+'/storyboards');
  // Even the latest refresh must not replace the editor with an older resource version.
  await page.route(api,async(route:any)=>route.request().method()==='GET'?route.fulfill({json:{data:original}}):route.continue());
  await page.reload();await page.waitForTimeout(1000);
  assert.equal(await page.getByLabel('Your plan',{exact:true}).inputValue(),newer);
  await page.getByText('Revision 2',{exact:true}).waitFor();
  await page.unroute(api);
  // A superseded refresh's error must not replace a newer successful load.
  let releaseError!:()=>void,startedError!:()=>void;first=true;
  const errorGate=new Promise<void>(r=>{releaseError=r;});const errorStarted=new Promise<void>(r=>{startedError=r;});
  await page.route(api+'/storyboards',async(route:any)=>{
   if(!first){await route.continue();return;}first=false;startedError();await errorGate;
   await route.fulfill({status:503,json:{error:{message:'Superseded refresh failure'}}});
  });
  await page.reload();await errorStarted;
  await page.getByLabel('Your plan',{exact:true}).fill(newer+' Another saved edit.');
  await page.getByText('Revision 3',{exact:true}).waitFor();
  await page.getByRole('status').filter({hasText:'All changes saved'}).waitFor();
  releaseError();await page.waitForTimeout(700);
  assert.equal(await page.getByText('Superseded refresh failure',{exact:true}).count(),0);
  assert.equal(await page.getByLabel('Your plan',{exact:true}).inputValue(),newer+' Another saved edit.');
  assert.deepEqual(errors,[]);
  const report={delayedRefreshDuringAutosave:'passed',olderResourceVersion:'rejected',supersededRefreshError:'discarded',pageErrors:errors,database:'isolated temporary replica set',providerCalls:0};
  writeFileSync('../docs/implementation/F10-refresh-browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 } finally {await browser?.close();if(child.pid)try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}writeFileSync('../.local/F10-refresh-preview.log',logs);await connection.client.close();await server.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
