import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import {Inngest} from "inngest";
import {serve} from "inngest/node";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import {connectDatabase} from "../src/server/db/client";
import {migrateJobs} from "../src/server/jobs/schema";
import {createPlanningWorkflow} from "../src/server/jobs/inngest";
import {admitIdeas} from "../src/server/projects/ideas";
import {dispatchOutbox} from "../src/server/jobs/outbox";
import {provisionProfile} from "../src/server/auth/profile";
import {createProject} from "../src/server/projects/service";
import {validateCreate} from "../src/server/projects/model";
async function main(){
 process.env.INNGEST_DEV="http://127.0.0.1:8298";
 const db=await MongoMemoryReplSet.create({binary:{version:"8.2.6"},replSet:{count:1}}),c=await connectDatabase({uri:db.getUri(),database:"inngest_test",production:false});
 await migrateJobs(c.db);let calls=0;const client=new Inngest({id:"studio-integration-test",isDev:true,baseUrl:"http://127.0.0.1:8298"});
 const fn=createPlanningWorkflow(client,async()=>c,async()=>{calls++;return {ideas:[{title:"Packets",refinedIdea:"Explain internet packets",rationale:"Clear example"}]};});
 const server=createServer(serve({client,functions:[fn]}));await new Promise<void>(r=>server.listen(3198,"127.0.0.1",r));
 const cli=spawn("node_modules/inngest-cli/bin/inngest.exe",["dev","--host","127.0.0.1","--port","8298","--connect-gateway-port","8299","--connect-gateway-grpc-port","50062","--connect-executor-grpc-port","50063","--no-discovery","-u","http://127.0.0.1:3198/api/inngest"],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let logs="";cli.stdout.on("data",d=>logs+=d);cli.stderr.on("data",d=>logs+=d);
 try{
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch("http://127.0.0.1:8298/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,"local broker did not start");
  const sync=await fetch("http://127.0.0.1:3198/api/inngest",{method:"PUT"});assert.ok(sync.ok,await sync.text());
  const user={id:"broker-owner",name:"Broker Test",email:"broker@example.com",emailVerified:true,createdAt:new Date(),updatedAt:new Date()};await provisionProfile(c.db,user);
  const p=(await createProject(c,user.id,validateCreate({title:"Internet",originalIdea:"Explain how internet packets work"}),randomUUID(),randomUUID())).data;
  const r=await admitIdeas(c,user.id,p.id,"IDEA_BRAINSTORM",{expectedRevision:1,count:1,guidance:""},randomUUID(),true,"fixture"),id=String(r.data.jobId);
  assert.equal(await dispatchOutbox(c.db,e=>client.send(e)),1);
  let completed=false;for(let i=0;i<120;i++){if((await c.db.collection("generationJobs").findOne({_id:id as never}))?.state==="SUCCEEDED"){completed=true;break;}await new Promise(r=>setTimeout(r,500));}assert.ok(completed,"broker did not complete the queued job");assert.equal(calls,1);
  await client.send({id:randomUUID(),name:"studio/planning.requested",data:{eventId:id,jobId:id}});await new Promise(r=>setTimeout(r,2000));assert.equal(calls,1);
  const report={broker:"Inngest CLI 1.49.0",sdk:"4.26.2",dispatch:"passed",workflow:"passed",duplicateDelivery:"passed",providerCalls:calls,provider:"injected deterministic fixture; no paid calls",database:"temporary replica set"};writeFileSync("../docs/implementation/F14-inngest-verification.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{cli.kill();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await c.client.close();await db.stop();writeFileSync("../.local/F14-inngest-test.log",logs);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
