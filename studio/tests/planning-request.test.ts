import assert from "node:assert/strict";
import {test} from "node:test";
import {sendPlanningCommand,planningErrorMessage} from "../src/shared/planning-request";
const operation={path:"/api/v1/projects/example/storyboards/generate",body:{expectedRevision:1},key:"original-request-key"};
test("lost response retries once using identical path, serialized input and key",async()=>{
 const calls:{path:unknown;init:RequestInit|undefined}[]=[];let recovery=0;
 const fetcher:typeof fetch=async(path,init)=>{calls.push({path,init});if(calls.length===1)throw new DOMException("signal timed out","TimeoutError");return Response.json({data:{jobId:"same-job"}},{status:202});};
 const result=await sendPlanningCommand(operation,"csrf",()=>recovery++,fetcher);
 assert.equal(result.body.data.jobId,"same-job");assert.equal(calls.length,2);assert.equal(recovery,1);
 for(const call of calls){assert.equal(call.path,operation.path);assert.equal(call.init?.body,JSON.stringify(operation.body));assert.equal(new Headers(call.init?.headers).get("idempotency-key"),operation.key);assert.equal(new Headers(call.init?.headers).get("x-csrf-token"),"csrf");}
});
test("recovery is bounded and hides raw browser timeout errors",async()=>{
 let calls=0;await assert.rejects(sendPlanningCommand(operation,"csrf",()=>{},async()=>{calls++;throw new TypeError("Failed to fetch");}),/retry the same request safely/i);assert.equal(calls,2);
 assert.ok(!planningErrorMessage(new DOMException("signal timed out","TimeoutError")).includes("signal timed out"));
});
test("explicit HTTP rejection is returned without automatic resubmission",async()=>{
 let calls=0;const result=await sendPlanningCommand(operation,"csrf",()=>assert.fail(),async()=>{calls++;return Response.json({error:{message:"Verify your email"}},{status:403});});assert.equal(result.response.status,403);assert.equal(calls,1);
});
test("interrupted response body uses the same receipt recovery",async()=>{
 let calls=0;const result=await sendPlanningCommand(operation,"csrf",()=>{},async()=>{calls++;return calls===1?new Response(new ReadableStream({start(controller){controller.error(new TypeError("Connection closed"));}})):Response.json({data:{jobId:"accepted-before-interruption"}});});assert.equal(calls,2);assert.equal(result.body.data.jobId,"accepted-before-interruption");
});
