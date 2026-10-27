"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectDTO } from "@/server/projects/model";
import { StoryboardPanel } from "./storyboard-panel";
import { IdeaPanel } from "./idea-panel";
import { DeleteProject } from "./delete-project";
type Fields = { title: string; refinedIdea: string; audience: string; niche: string };
const names = ["title", "refinedIdea", "audience", "niche"] as const;
const labels = { title: "Project title", refinedIdea: "Your plan", audience: "Audience", niche: "Niche" };
function fields(project: ProjectDTO): Fields { return { title: project.title, refinedIdea: project.refinedIdea ?? project.originalIdea, audience: project.audience ?? "", niche: project.niche ?? "" }; }
const same = (a: Fields, b: Fields) => names.every(k => a[k] === b[k]);
export function PlanEditor({ project }: { project: ProjectDTO }) {
  const [ideaBusy, setIdeaBusy] = useState(false);
  const [base, setBase] = useState(project), [draft, setDraft] = useState<Fields>(() => fields(project));
  const [status, setStatus] = useState<"idle" | "saving" | "checking" | "error" | "conflict">("idle");
  const [error, setError] = useState(""), [remote, setRemote] = useState<ProjectDTO | null>(null);
  const busy = useRef(false), mounted = useRef(true), latest = useRef(draft), accepted = useRef(project);
  const dirty = !same(draft, fields(base));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!dirty && status !== "saving") return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (link && !event.defaultPrevented && !window.confirm("Your plan has unsaved changes. Leave this page?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, status]);
  const accept = useCallback((saved: ProjectDTO, sent: Fields) => {
    if (saved.id !== accepted.current.id || saved.resourceVersion < accepted.current.resourceVersion) return;
    accepted.current = saved;
    const normalized = fields(saved), current = latest.current;
    const merged = { ...current }; for (const key of names) if (current[key] === sent[key]) merged[key] = normalized[key];
    latest.current = merged; setDraft(merged); setBase(saved); setRemote(null); setError(""); setStatus("idle");
  }, []);
  const acceptRefresh = useCallback((saved: ProjectDTO) => {
    if (busy.current || !same(latest.current, fields(accepted.current))) return;
    accept(saved, latest.current);
  }, [accept]);
  const reconcile = useCallback(async (sent: Fields) => {
    setStatus("checking");
    const response = await fetch(`/api/v1/projects/${project.id}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    if (!mounted.current) return;
    if (!response.ok) { setStatus("error"); setError(response.status === 404 ? "This project is no longer available. Your edits remain here so you can copy them." : "We couldn’t read the saved version. Your edits are still here; retry when connected."); return; }
    const saved = body.data as ProjectDTO;
    if (same(fields(saved), sent)) accept(saved, sent);
    else { setRemote(saved); setStatus("conflict"); setError("Review the saved version before continuing. Your local edits have been kept."); }
  }, [project.id, accept]);
  const save = useCallback(async () => {
    if (busy.current || !dirty) return;
    busy.current = true; setStatus("saving"); setError("");
    const sent = { ...draft }, previous = fields(base);
    const patch: Record<string, unknown> = { expectedRevision: base.revision };
    for (const key of names) if (sent[key] !== previous[key]) patch[key] = (key === "audience" || key === "niche") && !sent[key].trim() ? null : sent[key];
    try {
      const tokenResponse = await fetch("/api/v1/csrf", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!tokenResponse.ok) { if (mounted.current) { setStatus("error"); setError("Your session or connection needs attention. Sign in again if needed, then check the saved version below."); } return; }
      const csrf = await tokenResponse.json();
      const response = await fetch(`/api/v1/projects/${project.id}`, { method: "PATCH", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token }, body: JSON.stringify(patch) });
      const body = await response.json(); if (!mounted.current) return;
      if (response.ok) accept(body.data, sent);
      else if (response.status === 409 || response.status >= 500) await reconcile(sent);
      else { setStatus("error"); setError([body.error?.message, ...(body.error?.fieldErrors ?? []).map((e: { message: string }) => e.message)].filter(Boolean).join(" ") || "We couldn’t save. Your edits are still here."); }
    } catch {
      if (mounted.current) { try { await reconcile(sent); } catch { setStatus("error"); setError("The connection was interrupted. Your edits are still here. Check the saved version before retrying."); } }
    } finally { busy.current = false; }
  }, [base, draft, dirty, project.id, accept, reconcile]);
  useEffect(() => { if (!dirty || status !== "idle") return; const timer = setTimeout(() => void save(), 800); return () => clearTimeout(timer); }, [dirty, status, save]);
  async function checkSaved() {
    if (busy.current) return; busy.current = true;
    try { await reconcile({ ...latest.current }); } catch { setStatus("error"); setError("Still unable to connect. Your edits remain here."); } finally { busy.current = false; }
  }
  function change(key: keyof Fields, value: string) { const updated = { ...latest.current, [key]: value }; latest.current = updated; setDraft(updated); }
  function useSaved() { if (!remote || !window.confirm("Replace your local edits with the saved version?")) return; const next = fields(remote); latest.current = next; setDraft(next); accepted.current = remote; setBase(remote); setRemote(null); setError(""); setStatus("idle"); }
  return <div className="plan-editor"><header className="page-heading"><p className="eyebrow">01 / Shape your idea</p><h1>Make the idea yours.</h1><p className="lead">A clear plan is where a good explanation begins.</p></header>
    <div className="plan-save-bar"><p role="status" aria-live="polite">{status === "saving" ? "Saving…" : status === "checking" ? "Checking saved version…" : status === "conflict" ? "Review changes" : status === "error" ? "Not saved" : dirty ? "Unsaved changes · autosave shortly" : "All changes saved"}</p><span>Revision {base.revision}</span></div>
    {error && <div className="auth-error" role="alert"><p>{error}</p>{status === "error" && <button type="button" className="button secondary" onClick={() => void checkSaved()}>Check saved version</button>}</div>}
    {remote && status === "conflict" && <section className="plan-conflict" aria-labelledby="conflict-heading"><h2 id="conflict-heading">Choose how to continue</h2><p>The saved version is revision {remote.revision}. Saving yours will replace its plan fields.</p><div className="plan-compare"><div><h3>Your local version</h3>{names.map(k => <div key={k}><strong>{labels[k]}</strong><p>{draft[k] || "Not specified"}</p></div>)}</div><div><h3>Latest saved version</h3>{names.map(k => <div key={k}><strong>{labels[k]}</strong><p>{fields(remote)[k] || "Not specified"}</p></div>)}</div></div><div className="plan-actions"><button type="button" className="button secondary" onClick={useSaved}>Use saved version</button><button type="button" className="button primary" onClick={() => { accepted.current = remote; setBase(remote); setRemote(null); setError(""); setStatus("idle"); }}>Save my version</button></div></section>}
    <div className="plan-layout"><form className="project-form" onSubmit={event => { event.preventDefault(); if (status === "idle") void save(); }}>
      <fieldset disabled={ideaBusy} className="plan-fieldset"><label htmlFor="plan-title">Project title<input id="plan-title" value={draft.title} onChange={event => change("title", event.target.value)} /></label>
      <label htmlFor="plan-idea">Your plan</label><textarea id="plan-idea" rows={9} value={draft.refinedIdea} onChange={event => change("refinedIdea", event.target.value)} aria-describedby="plan-count" /><p id="plan-count" className="field-hint">{[...draft.refinedIdea].length.toLocaleString()} / 5,000 characters. Explain what the viewer should understand.</p>
      <div className="project-form-pair"><label htmlFor="plan-audience">Audience <span>(optional)</span><input id="plan-audience" value={draft.audience} onChange={event => change("audience", event.target.value)} /></label><label htmlFor="plan-niche">Niche <span>(optional)</span><input id="plan-niche" value={draft.niche} onChange={event => change("niche", event.target.value)} /></label></div>
      <div className="project-form-footer"><p>Your changes save after a short pause.</p><button className="button primary" disabled={!dirty || status !== "idle"} type="submit">Save now</button></div>
    </fieldset></form><aside className="plan-reference"><p className="eyebrow">The starting point</p><h2>Your original idea</h2><p className="saved-idea">{project.originalIdea}</p><div><span className="status-label">{project.settings.targetDurationSeconds}s target</span><p className="field-hint">This original stays here as a reference while you shape your plan.</p></div></aside></div>
    <IdeaPanel project={base} disabled={dirty || ideaBusy || status !== "idle"} onBusy={setIdeaBusy} onProject={acceptRefresh} />
    <StoryboardPanel project={base} disabled={dirty || ideaBusy || status !== "idle"} onBusy={setIdeaBusy} onProject={acceptRefresh} />
    <div className="project-next"><p>Your plan and accepted storyboards stay saved in this project.</p>{!dirty && !ideaBusy && status === "idle" && <DeleteProject key={base.revision} id={base.id} title={base.title} revision={base.revision} />}</div>
  </div>;
}
