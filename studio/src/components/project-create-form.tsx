"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";

export function ProjectCreateForm() {
  const router = useRouter();
  const [idea, setIdea] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const [fields, setFields] = useState<{ path: string; message: string }[]>([]);
  const intent = useRef<{ body: string; key: string } | null>(null); const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const body = JSON.stringify({ title: String(data.get("title") ?? ""), originalIdea: idea, ...(String(data.get("audience") ?? "").trim() ? { audience: data.get("audience") } : {}), ...(String(data.get("niche") ?? "").trim() ? { niche: data.get("niche") } : {}), targetDurationSeconds: Number(data.get("duration")) });
    if (intent.current?.body !== body) intent.current = { body, key: crypto.randomUUID() };
    submitting.current = true; setPending(true); setError(""); setFields([]);
    try {
      const tokenResponse = await fetch("/api/v1/csrf", { cache: "no-store" });
      if (!tokenResponse.ok) { setError(tokenResponse.status === 401 ? "Your session expired. Sign in in another tab, then retry here to keep your idea." : "We couldn’t connect. Your idea is still here; please retry."); return; }
      const csrf = await tokenResponse.json();
      const response = await fetch("/api/v1/projects", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token, "Idempotency-Key": intent.current!.key }, body });
      const result = await response.json();
      if (!response.ok) { setError(result.error?.message ?? "We couldn’t save your project. Please retry."); setFields(result.error?.fieldErrors ?? []); return; }
      router.push(`/projects/${result.data.id}`); router.refresh();
    } catch { setError("The connection was interrupted. Your idea is still here. Retry with the same details to avoid creating a duplicate."); }
    finally { submitting.current = false; setPending(false); }
  }
  return <form className="project-form" onSubmit={submit} aria-busy={pending}>
    {error && <div className="auth-error" role="alert"><p>{error}</p>{fields.length > 0 && <ul>{fields.map((field) => <li key={field.path}>{field.message}</li>)}</ul>}</div>}
    <fieldset disabled={pending}>
      <label htmlFor="project-title">Give your project a name<input id="project-title" name="title" required placeholder="e.g. The internet, explained" /></label><p className="field-hint">A short name for your library. Up to 120 characters.</p>
      <label htmlFor="project-idea">What do you want to explain?<textarea id="project-idea" name="originalIdea" value={idea} onChange={(event) => setIdea(event.target.value)} required rows={7} placeholder="Start with a question, a concept, or something you wish more people understood." aria-describedby="idea-count" /></label>
      <p id="idea-count" className="field-hint">{[...idea].length.toLocaleString()} / 5,000 characters · One clear idea is a great start.</p>
      <div className="project-form-pair"><label htmlFor="project-audience">Audience <span>(optional)</span><input id="project-audience" name="audience" placeholder="e.g. Curious beginners" /></label><label htmlFor="project-niche">Niche <span>(optional)</span><input id="project-niche" name="niche" placeholder="e.g. Everyday technology" /></label></div>
      <label htmlFor="project-duration">Target video length<select id="project-duration" name="duration" defaultValue="75">{Array.from({ length: 31 }, (_, i) => i + 60).map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds{seconds === 75 ? " · recommended" : ""}</option>)}</select></label>
      <p className="field-hint">A planning target. The finished duration will depend on the narration.</p>
      <div className="project-form-footer"><p>Create a draft to save this idea to your account and return to it later.</p><button className="button primary" type="submit">{pending ? "Saving your draft…" : "Create draft"}<Icon name="arrow" /></button></div>
    </fieldset>
  </form>;
}
