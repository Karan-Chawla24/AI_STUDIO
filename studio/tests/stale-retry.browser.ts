/* eslint-disable @typescript-eslint/no-explicit-any -- Browser harness loads the externally supplied Playwright runtime. */
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {spawn,execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import {connectDatabase} from "../src/server/db/client";
import {migrateJobs} from "../src/server/jobs/schema";
import {admitIdeas,runIdea,retryIdea} from "../src/server/projects/ideas";
import {readProject} from "../src/server/projects/service";
import {ProjectError} from "../src/server/projects/model";
import type {IdeaJob} from "../src/server/projects/ideas-model";
async function main(){
 const {chromium}=createRequire(process.cwd()+"/package.json")(process.env.PLAYWRIGHT_MODULE||"playwright");
 const db=await MongoMemoryReplSet.create({binary:{version:"8.2.6"},replSet:{count:1}}),c=await connectDatabase({uri:db.getUri(),database:"stale_retry_test",production:false});await migrateJobs(c.db);
 const origin="http://localhost:3113",child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--port","3113"],{env:{...process.env,NODE_ENV:"development",MONGODB_URI:db.getUri(),MONGODB_DB_NAME:"stale_retry_test",APP_ORIGIN:origin,BETTER_AUTH_SECRET:randomBytes(32).toString("hex"),EMAIL_DELIVERY:"preview",GEMINI_API_KEY:"fixture",GEMINI_MODEL:"fixture"},windowsHide:true,stdio:["ignore","pipe","pipe"]});let logs="",browser;
 child.stdout.on("data",d=>logs+=d);child.stderr.on("data",d=>logs+=d);
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+"/sign-in")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready);
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});const page=await browser.newPage();page.setDefaultTimeout(15000);const errors:string[]=[];page.on("pageerror",(e:Error)=>errors.push(e.message));
  const account={name:"Retry QA",email:"retry-qa@example.com",password:"Browser retry password 42"};assert.equal((await page.request.post(origin+"/api/auth/sign-up/email",{headers:{Origin:origin},data:account})).status(),200);
  await page.goto(origin+"/sign-in");await page.getByLabel("Email address").fill(account.email);await page.getByLabel("Password",{exact:true}).fill(account.password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.waitForURL("**/home");
  await page.goto(origin+"/projects/new");await page.getByLabel("Give your project a name").fill("Retry QA");await page.getByLabel("What do you want to explain?").fill("How internet packets reach their destination.");await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.waitForURL(/\/projects\/[a-f0-9-]+$/);
  const id=page.url().split("/").at(-1)!,user=await c.db.collection("user").findOne({email:account.email}),owner=String(user!._id),api=origin+"/api/v1/projects/"+id;
  for(const kind of ["IDEA_BRAINSTORM","STORYBOARD_GENERATE"] as const){
   console.log("Testing",kind);const p=await readProject(c,owner,id),r=await admitIdeas(c,owner,id,kind,{expectedRevision:p.revision,count:1,guidance:"",replaceExistingConfirmed:false},randomUUID(),true,"fixture");
   await runIdea(c,String(r.data.jobId),async()=>{throw new ProjectError("INVALID_PROVIDER_OUTPUT","The response could not be validated.",502);});
   await page.reload();const panel=page.locator(kind==="IDEA_BRAINSTORM"?".idea-panel":".storyboard-panel");await panel.getByRole("button",{name:"Retry request",exact:true}).waitFor();
   let release!:()=>void;const gate=new Promise<void>(r=>release=r);
   await page.route(api+"/jobs?*",async(route:any)=>{await gate;await route.continue().catch(()=>{});});
   await page.getByLabel("Your plan",{exact:true}).fill("Updated plan for "+kind+": explain how browsers send and receive packets.");await page.getByText(`Revision ${p.revision+1}`,{exact:true}).waitFor();
   assert.equal(await panel.getByRole("button",{name:"Retry request",exact:true}).count(),0,"hide retry using current project even while job refresh is delayed");release();await page.unrouteAll({behavior:"ignoreErrors"});
   await page.reload();await panel.getByText("The response could not be validated.",{exact:true}).waitFor();assert.equal(await panel.getByRole("button",{name:"Retry request",exact:true}).count(),0);
   const job=(await c.db.collection<IdeaJob>("generationJobs").findOne({_id:String(r.data.jobId)}))!;await assert.rejects(retryIdea(c,owner,id,job._id,job.resourceVersion,randomUUID(),true),{code:"PROPOSAL_STALE"});
  }
  assert.deepEqual(errors,[]);const report={ideaRetry:"hidden after save and reload",storyboardRetry:"hidden after save and reload",delayedJobRefresh:"does not expose stale retry",serverStaleGuard:"preserved",pageErrors:errors,providerCalls:0};writeFileSync("../docs/implementation/F14-stale-retry-verification.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser?.close();if(child.pid)try{execFileSync("taskkill",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});}catch{}writeFileSync("../.local/F14-stale-retry-preview.log",logs);await c.client.close();await db.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
