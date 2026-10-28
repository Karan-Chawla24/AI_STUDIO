import { loadEnvConfig } from "@next/env";
import { getDatabase, closeDatabase, assertTransactionSupport } from "../src/server/db/client";
import { migrateCompilation as migrateStoryboards, verifyCompilation as verifyStoryboards } from "../src/server/projects/compile-schema";
import { drainIdeas } from "../src/server/projects/ideas";
import { ideaConfig } from "../src/server/projects/ideas-provider";
import { DatabaseError } from "../src/server/db/config";
async function main() {
 const command=process.argv[2];if(!["migrate","verify","worker"].includes(command))throw new Error();
 loadEnvConfig(process.cwd(),true,{info:()=>{},error:()=>{}});
 const c=await getDatabase();await assertTransactionSupport(c.db);
 if(command==="migrate")console.log(`Storyboard migration: ${await migrateStoryboards(c.db)}`);
 else if(command==="verify"){await verifyStoryboards(c.db);console.log("Storyboard schema and indexes verified.");}
 else {ideaConfig();await verifyStoryboards(c.db);let stop=false;process.on("SIGINT",()=>{stop=true;});process.on("SIGTERM",()=>{stop=true;});console.log("Planning worker ready (ideas and storyboards).");while(!stop){try{await drainIdeas(c);}catch{console.error("IDEA_WORKER_CYCLE_FAILED: retrying durable queue; no automatic provider resend.");}await new Promise(r=>setTimeout(r,3000));}}
}
main().catch((e:unknown)=>{console.error(e instanceof DatabaseError?`${e.code}: ${e.message}`:"IDEAS_COMMAND_FAILED: Check configuration and migration state.");process.exitCode=1;}).finally(()=>closeDatabase());
