"use client";
import {sendPlanningCommand,planningErrorMessage} from "@/shared/planning-request";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectDTO } from "@/server/projects/model";
import type { jobDTO, proposalDTO, Idea } from "@/server/projects/ideas-model";
type Job=ReturnType<typeof jobDTO>;type Proposal=ReturnType<typeof proposalDTO> & {payload:{ideas:Idea[]}};
export function IdeaPanel({project,disabled,onProject,onBusy}:{project:ProjectDTO;disabled:boolean;onProject:(p:ProjectDTO)=>void;onBusy:(busy:boolean)=>void}) {
 const [recovering,setRecovering]=useState(false);
 const [hasPending,setHasPending]=useState(false);
 const [guidance,setGuidance]=useState(""),[count,setCount]=useState(3),[proposals,setProposals]=useState<Proposal[]>([]),[job,setJob]=useState<Job|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[cursor,setCursor]=useState<string|null>(null);
 const projectCallback=useRef(onProject);
 useEffect(()=>{projectCallback.current=onProject;},[onProject]);
 const mounted=useRef(true),pending=useRef<{path:string;body:object;key:string}|null>(null),gate=useRef(false);
 const root=`/api/v1/projects/${project.id}`;
 const read=useCallback(async(path:string)=>{const r=await fetch(path,{cache:"no-store",signal:AbortSignal.timeout(15000)});const b=await r.json();if(!r.ok)throw new Error(b.error?.message??"Couldn’t load suggestions.");return b.data;},[]);
 const refresh=useCallback(async()=>{try{const [p,j,saved]=await Promise.all([read(`${root}/proposals?kind=IDEAS`),read(`${root}/jobs?limit=1`),read(root)]);if(mounted.current){projectCallback.current(saved);setProposals(p.items);setCursor(p.page.nextCursor);setJob(j.items[0]?.kind==="STORYBOARD_GENERATE"?null:j.items[0]??null);setLoading(false);}}catch(e){if(mounted.current){setError(planningErrorMessage(e));setLoading(false);setJob(j=>j?{...j}:j);}}},[read,root]);
 useEffect(()=>{mounted.current=true;const timer=setTimeout(()=>void refresh(),0);return()=>{mounted.current=false;clearTimeout(timer);};},[refresh]);
 useEffect(()=>{if(!job||!["QUEUED","RUNNING","CANCEL_REQUESTED"].includes(job.state))return;const timer=setTimeout(()=>void refresh(),document.hidden?15000:3000);return()=>clearTimeout(timer);},[job,refresh]);
 async function command(path:string,body:object,retry=false){
  if(gate.current)return;gate.current=true;setWorking(true);onBusy(true);setError("");setRecovering(false);
  const operation=retry&&pending.current?pending.current:{path,body,key:crypto.randomUUID()};pending.current=operation;setHasPending(true);
  try{
   const csrf=await read("/api/v1/csrf");const {response:r,body:b}=await sendPlanningCommand(operation,csrf.token,()=>setRecovering(true));
   if(!r.ok){if(r.status<500){pending.current=null;setHasPending(false);}throw new Error(b.error?.message??"Couldn’t complete the request.");}
   pending.current=null;setHasPending(false);
   if(b.data.project)onProject(b.data.project);
   else onProject(await read(root));
   await refresh();
  }catch(e){if(mounted.current){setError(planningErrorMessage(e));await refresh();}}finally{gate.current=false;if(mounted.current){setWorking(false);onBusy(false);}}
 }
 const active=!!project.activeJob || !!job&&["QUEUED","RUNNING","CANCEL_REQUESTED","REQUIRES_ATTENTION"].includes(job.state),locked=disabled||working||active||hasPending;
 return <section className="idea-panel" aria-labelledby="idea-heading"><header><p className="eyebrow">A second perspective</p><h2 id="idea-heading">Explore what your idea could become.</h2><p>Find a fresh angle or sharpen your current plan. Nothing changes until you choose a suggestion.</p></header>
 <label htmlFor="idea-guidance">A little direction <span>(optional)</span></label><textarea id="idea-guidance" rows={2} maxLength={1000} value={guidance} disabled={working} onChange={e=>setGuidance(e.target.value)} placeholder="For example: explain it through an everyday analogy."/>
 <div className="plan-actions"><label htmlFor="idea-count">Ideas <select id="idea-count" value={count} disabled={locked} onChange={e=>setCount(Number(e.target.value))}>{[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n}>{n}</option>)}</select></label><button className="button primary" disabled={locked} onClick={()=>void command(`${root}/ideas/brainstorm`,{expectedRevision:project.revision,count,guidance})}>Explore ideas</button><button className="button secondary" disabled={locked} onClick={()=>void command(`${root}/ideas/refine`,{expectedRevision:project.revision,guidance})}>Refine this plan</button></div>
 {disabled&&!working&&<p className="field-hint">Finish saving your edits before requesting or applying suggestions.</p>}
 {working&&<p role="status">{recovering?"Checking whether your request was accepted…":"Submitting your request…"}</p>}
 {error&&<div className="auth-error" role="alert"><p>{error}</p>{hasPending?<button className="button secondary" disabled={working} onClick={()=>void command("",{},true)}>Retry the same request</button>:<button className="button secondary" onClick={()=>void refresh()}>Refresh suggestions</button>}</div>}
 {loading&&<p role="status">Loading your suggestions…</p>}
 {job&&<div className="idea-job" role="status"><strong>{job.state==="QUEUED"?"Waiting for the idea worker…":["RUNNING","CANCEL_REQUESTED"].includes(job.state)?job.cancelRequested?"Cancellation requested. Waiting for the provider to finish…":"Shaping your ideas…":job.state==="SUCCEEDED"?"Your suggestions are ready.":job.state==="CANCELLED"?"Request cancelled.":job.error?.message??"This request has finished."}</strong>{job.allowedActions.includes("CANCEL")&&!job.cancelRequested&&<button className="button secondary" disabled={working} onClick={()=>void command(`${root}/jobs/${job.id}/cancel`,{expectedVersion:job.resourceVersion})}>Cancel request</button>}</div>}
 {!loading&&!proposals.length&&!active&&<p className="field-hint">Your saved plan is the starting point. Ask for a few directions, then choose the one that fits.</p>}
 <div className="idea-proposals">{proposals.map(p=><article className="idea-proposal" key={p.id}><div className="plan-save-bar"><strong>{p.state==="PENDING"?"Ready to review":p.state.toLowerCase()}</strong><span>From revision {p.baseRevision}</span></div>{(p.state==="CONFLICTED"||p.baseRevision!==project.revision)&&p.state!=="APPLIED"&&<p className="field-hint">This was created from an older plan. Generate again or copy useful text into your current plan.</p>}<div className="idea-grid">{p.payload.ideas.map((idea,i)=><div className="proposal-option" key={idea.id}><span className="eyebrow">Direction {String(i+1).padStart(2,"0")}</span><h3>{idea.title}</h3><p>{idea.refinedIdea}</p><p className="field-hint">{idea.rationale}</p>{p.state==="PENDING"&&p.baseRevision===project.revision&&<button className="button primary" disabled={locked} onClick={()=>{if(window.confirm("Replace your saved plan with this suggestion? Your original idea stays available."))void command(`${root}/proposals/${p.id}/apply`,{expectedRevision:project.revision,expectedVersion:p.version,selectedIdeaId:idea.id});}}>Use this idea</button>}</div>)}</div>{["PENDING","CONFLICTED"].includes(p.state)&&<button className="button secondary" disabled={disabled||working||hasPending} onClick={()=>void command(`${root}/proposals/${p.id}/dismiss`,{expectedVersion:p.version})}>Dismiss this set</button>}</article>)}</div>
 {cursor&&<button className="button secondary" disabled={working} onClick={async()=>{try{const page=await read(`${root}/proposals?kind=IDEAS&cursor=${encodeURIComponent(cursor)}`);setProposals(current=>[...current,...page.items.filter((p:Proposal)=>!current.some(x=>x.id===p.id))]);setCursor(page.page.nextCursor);}catch(e){setError(planningErrorMessage(e));}}}>Older suggestions</button>}
 </section>;
}
