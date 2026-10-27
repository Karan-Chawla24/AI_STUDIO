import assert from "node:assert/strict";
import {test} from "node:test";
import {sendPlanningCommand,sendPlanningCancellation,planningErrorMessage,type PlanningCommand} from "../src/shared/planning-request";
const operation={path:"/api/v1/projects/example/storyboards/generate",body:{expectedRevision:1},key:"original-request-key"};
test("lost response retries once using identical path, serialized input and key",async()=>{
 const calls:{path:unknown;init:RequestInit|undefined}[]=[];let recovery=0;
 const fetcher:typeof fetch=async(path,init)=>{calls.push({path,init});if(calls.length===1)throw new DOMException("signal timed out","TimeoutError");return Response.json({data:{jobId:"same-job"}},{status:202});};
 const result=await sendPlanningCommand(operation,"csrf",()=>recovery++,fetcher);
 assert.equal(result.body.data.jobId,"same-job");assert.equal(calls.length,2);assert.equal(recovery,1);
 for(const call of calls){assert.equal(call.path,operation.path);assert.equal(call.init?.body,JSON.stringify(operation.body));assert.equal(new Headers(call.init?.headers).get("idempotency-key"),operation.key);assert.equal(new Headers(call.init?.headers).get("x-csrf-token"),"csrf");}
});

test("cancellation refreshes a version conflict and preserves the replacement key on a lost response",async()=>{
 const op={...operation,path:operation.path+"/cancel"};let replacement:PlanningCommand=op;const calls:RequestInit[]=[];let n=0;
 const result=await sendPlanningCancellation(op,"csrf",()=>{},next=>{replacement=next;},async(_path,init)=>{
  calls.push(init!);n++;
  if(n===1)return Response.json({error:{code:"VERSION_CONFLICT"}},{status:409});
  if(n===2)return Response.json({data:{resourceVersion:2,allowedActions:["CANCEL"],cancelRequested:false}});
  if(n===3)throw new TypeError("Lost acknowledgement");
  return Response.json({data:{state:"CANCEL_REQUESTED"}},{status:202});
 });
 assert.equal(result.response.status,202);assert.notEqual(replacement.key,op.key);
 assert.equal(calls[2].body,JSON.stringify({expectedVersion:2}));assert.equal(calls[3].body,calls[2].body);
 assert.equal(new Headers(calls[2].headers).get("Idempotency-Key"),replacement.key);
 assert.equal(new Headers(calls[3].headers).get("Idempotency-Key"),replacement.key);
});

test("cancellation stops when the refreshed job has completed or is already cancelling",async()=>{
 for(const job of [{state:"SUCCEEDED",allowedActions:[],cancelRequested:false},{state:"CANCEL_REQUESTED",allowedActions:["CANCEL"],cancelRequested:true}]){
  let calls=0;const result=await sendPlanningCancellation(operation,"csrf",()=>{},()=>assert.fail(),async()=>++calls===1?Response.json({error:{code:"VERSION_CONFLICT"}},{status:409}):Response.json({data:job}));
  assert.equal(calls,2);assert.equal(result.body.data.state,job.state);
 }
});

test("cancellation version recovery is bounded",async()=>{
 let calls=0;const result=await sendPlanningCancellation(operation,"csrf",()=>{},()=>{},async()=>++calls===2?Response.json({data:{resourceVersion:2,allowedActions:["CANCEL"]}}):Response.json({error:{code:"VERSION_CONFLICT"}},{status:409}));
 assert.equal(calls,3);assert.equal(result.response.status,409);
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
