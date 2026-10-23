"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function DeleteProject({ id, title, revision, onDeleted }: { id: string; title: string; revision: number; onDeleted?: () => void }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null), locked = useRef(false), retryKey = useRef<string | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const label = useId(), description = useId();
  async function remove() {
    if (locked.current) return;
    locked.current = true; setPending(true); setError(""); retryKey.current ??= crypto.randomUUID();
    try {
      const tokenResponse = await fetch("/api/v1/csrf", { cache: "no-store" });
      if (!tokenResponse.ok) { setError("Please sign in again, then retry here."); return; }
      const csrf = await tokenResponse.json();
      const response = await fetch(`/api/v1/projects/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token, "Idempotency-Key": retryKey.current }, body: JSON.stringify({ expectedRevision: revision, confirmation: "DELETE_PROJECT" }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error?.message ?? "We couldn’t delete this project. Try again."); return; }
      dialog.current?.close();
      if (onDeleted) onDeleted(); else { router.replace("/projects"); router.refresh(); }
    } catch { setError("The connection was interrupted. Retry here to confirm the same deletion request."); }
    finally { locked.current = false; setPending(false); }
  }
  return <><button type="button" className="project-delete-link" aria-label={`Delete ${title}`} onClick={() => { setError(""); dialog.current?.showModal(); }}>Delete project</button>
    <dialog ref={dialog} className="delete-dialog" aria-labelledby={label} aria-describedby={description} onCancel={event => { if (locked.current) event.preventDefault(); }}>
      <p className="eyebrow">Make room for what’s next</p><h2 id={label}>Delete this project?</h2><p className="delete-project-title">{title}</p>
      <p id={description}>This removes the draft from your library and deletes its saved idea. You can’t undo this.</p>
      {error && <p role="alert" className="auth-error">{error} <button type="button" className="project-delete-link" onClick={() => { dialog.current?.close(); retryKey.current = null; if (onDeleted) onDeleted(); else { router.replace("/projects"); router.refresh(); } }}>Refresh projects</button></p>}
      <div className="delete-dialog-actions"><button type="button" className="button secondary" disabled={pending} autoFocus onClick={() => dialog.current?.close()}>Keep project</button><button type="button" className="button danger" disabled={pending} onClick={() => void remove()}>{pending ? "Deleting…" : "Delete permanently"}</button></div>
    </dialog></>;
}
