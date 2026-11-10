import {loadEnvConfig} from "@next/env";
import {getDatabase,closeDatabase} from "../src/server/db/client";
import {migrateJobs,verifyJobs} from "../src/server/jobs/schema";
import {dispatchOutbox,jobHealth} from "../src/server/jobs/outbox";
import {reconcileIdeas,settleUnknown} from "../src/server/projects/ideas";
import {DatabaseError} from "../src/server/db/config";
import {ProjectError} from "../src/server/projects/model";
async function main(){
 loadEnvConfig(process.cwd(),true,{info:()=>{},error:()=>{}});const command=process.argv[2],c=await getDatabase();
 if(command==="migrate"){console.log(await migrateJobs(c.db));return;}
 if(command==="verify"){await verifyJobs(c.db);console.log("Durable job schema and indexes verified.");return;}
 if(command==="status"){console.log(JSON.stringify(await jobHealth(c.db)));return;}
 if(command==="settle"){
  const [id,version,operator,reason,ack]=process.argv.slice(3);
  if(!id||!Number.isSafeInteger(Number(version))||Number(version)<1)throw new Error("Invalid settlement arguments");
  await settleUnknown(c,id,Number(version),operator??"",reason??"",ack==="--accept-duplicate-cost");console.log("Uncertain job settled; provider journal retained. No new request sent.");return;
 }
 if(command!=="worker"&&command!=="dispatch")throw new Error("Invalid job command");
 await verifyJobs(c.db);
 const {inngest}=await import("../src/server/jobs/inngest");
 let stop=false;process.on("SIGINT",()=>{stop=true;});process.on("SIGTERM",()=>{stop=true;});console.log("Durable dispatcher ready.");
 do{try{await reconcileIdeas(c);await dispatchOutbox(c.db,e=>inngest.send(e));}catch{console.error("JOBS_CYCLE_FAILED: committed work retained for retry.");}if(command==="dispatch")break;await new Promise(r=>setTimeout(r,3000));}while(!stop);
}
main().catch(e=>{console.error(e instanceof DatabaseError||e instanceof ProjectError?`${e.code}: ${e.message}`:"JOBS_COMMAND_FAILED: Check arguments, configuration and migration state.");process.exitCode=1;}).finally(()=>closeDatabase());
