import "server-only";
import {Inngest} from "inngest";
import {getDatabase,type DatabaseConnection} from "../db/client";
import type {generateIdeas} from "../projects/ideas-provider";
import {dispatchOutbox} from "./outbox";
import {runIdea,reconcileIdeas} from "../projects/ideas";

export const inngest=new Inngest({id:"educational-video-studio"});
export function createPlanningWorkflow(client:Inngest,connection:()=>Promise<DatabaseConnection>=getDatabase,provider?:typeof generateIdeas){return client.createFunction({id:"planning-v1",triggers:{event:"studio/planning.requested"},retries:2,concurrency:{limit:2}},async({event,step})=>{
 const data=event.data as {eventId?:unknown;jobId?:unknown};
 if(typeof data?.eventId!=="string"||typeof data?.jobId!=="string")throw new Error("INVALID_PLANNING_EVENT");
 const {eventId,jobId}=data;
 await step.run("claim-and-execute-planning",async()=>{const c=await connection();await runIdea(c,jobId,provider,eventId);return {jobId};});
 return {jobId};
});}
export const planningWorkflow=createPlanningWorkflow(inngest);
export const recoveryWorkflow=inngest.createFunction({id:"planning-recovery-v1",triggers:{cron:"* * * * *"},retries:2,concurrency:{limit:1}},async({step})=>{
 await step.run("reconcile-expired-leases",async()=>reconcileIdeas(await getDatabase()));
 return step.run("dispatch-committed-outbox",async()=>dispatchOutbox((await getDatabase()).db,event=>inngest.send(event)));
});
