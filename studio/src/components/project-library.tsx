"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { creationStatuses, publicationStatuses, statusLabel, type ProjectSummary, type ProjectPage, type Dashboard } from "@/shared/project-library";
import { Icon } from "./icon";
import { DeleteProject } from "./delete-project";

export function ProjectLibrary({ dashboard = false }: { dashboard?: boolean }) {
  const [search, setSearch] = useState(""); const [q, setQ] = useState("");
  const [sort, setSort] = useState("updated_desc"), [creation, setCreation] = useState(""), [publication, setPublication] = useState("");
  const [items, setItems] = useState<ProjectSummary[]>([]), [next, setNext] = useState<string | null>(null);
  const [counts, setCounts] = useState<Dashboard["counts"] | null>(null);
  const [busy, setBusy] = useState(true), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const active = useRef<AbortController | null>(null), generation = useRef(0), failedCursor = useRef<string | null>(null);
  const query = useMemo(() => { const params = new URLSearchParams({ limit: "20", sort }); if (q) params.set("q", q); if (creation) params.set("creationStatus", creation); if (publication) params.set("publicationStatus", publication); return params.toString(); }, [q, sort, creation, publication]);
  const load = useCallback(async (cursor: string | null = null) => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    const version = ++generation.current; failedCursor.current = cursor; setBusy(true); setError(null);
    if (!cursor) { setItems([]); setCounts(null); setNext(null); setLoaded(false); }
    try {
      const url = dashboard ? "/api/v1/dashboard" : `/api/v1/projects?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const response = await fetch(url, { cache: "no-store", signal: controller.signal }); const body = await response.json();
      if (controller.signal.aborted || version !== generation.current) return;
      if (!response.ok) { setError({ code: body.error?.code ?? "SERVICE_UNAVAILABLE", message: response.status === 401 ? "Your session expired. Sign in to see your projects." : body.error?.message ?? "We couldn’t load your projects. Please try again." }); return; }
      if (dashboard) { const data = body.data as Dashboard; setItems(data.recentProjects); setCounts(data.counts); }
      else { const data = body.data as ProjectPage; setItems((previous) => Array.from(new Map([...(cursor ? previous : []), ...data.items].map((item) => [item.id, item])).values())); setNext(data.page.nextCursor); }
      setLoaded(true);
    } catch { if (!controller.signal.aborted && version === generation.current) setError({ code: "NETWORK", message: "We couldn’t connect. Please try again." }); }
    finally { if (version === generation.current && !controller.signal.aborted) setBusy(false); }
  }, [query, dashboard]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { window.clearTimeout(initial); active.current?.abort(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);
  function searchProjects(event: FormEvent) { event.preventDefault(); setQ(search.normalize("NFC").trim()); }
  function clearFilters() { setSearch(""); setQ(""); setCreation(""); setPublication(""); }
  const filtered = !!(q || creation || publication);
  return <section className="library-section" aria-label={dashboard ? "Your project dashboard" : "Project library"}>
    {dashboard ? <><div className="dashboard-stats" aria-label="Project totals"><div><span>Saved projects</span><strong>{counts?.projectsTotal ?? "—"}</strong></div><div><span>Drafts to explore</span><strong>{counts?.drafts ?? "—"}</strong></div><div><span>Ready videos</span><strong>{counts?.readyVideos ?? "—"}</strong></div></div><div className="section-heading"><h2>Pick up where you left off</h2><Link href="/projects">View all projects ↗</Link></div></> : <form className="library-controls" onSubmit={searchProjects}>
      <label className="library-search" htmlFor="library-search">Find a project<div><input id="library-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by the start of a title" /><button className="button secondary" type="submit">Search</button></div></label>
      <label htmlFor="library-creation">Creation status<select id="library-creation" value={creation} onChange={(event) => setCreation(event.target.value)}><option value="">All creation statuses</option>{creationStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
      <label htmlFor="library-publication">Publishing status<select id="library-publication" value={publication} onChange={(event) => setPublication(event.target.value)}><option value="">All publishing statuses</option>{publicationStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
      <label htmlFor="library-sort">Sort by<select id="library-sort" value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated_desc">Recently updated</option><option value="created_desc">Newest created</option><option value="title_asc">Title A–Z</option></select></label>
    </form>}
    <div className="library-result-bar"><p role="status">{busy ? "Loading your projects…" : loaded ? dashboard ? "Your most recent projects" : `${items.length} project${items.length === 1 ? "" : "s"} shown${next ? " · more available" : ""}` : "Your projects"}</p><button type="button" className="library-refresh" disabled={busy} onClick={() => void load()}>Refresh</button>{filtered && !dashboard && <button type="button" className="library-refresh" onClick={clearFilters}>Clear filters</button>}</div>
    {error && <div className="library-error" role="alert"><p>{error.message}</p>{error.code === "AUTH_REQUIRED" ? <Link className="button secondary" href="/sign-in">Sign in</Link> : <button type="button" className="button secondary" disabled={busy} onClick={() => void load(["CURSOR_EXPIRED", "INVALID_CURSOR"].includes(error.code) ? null : failedCursor.current)}>{["CURSOR_EXPIRED", "INVALID_CURSOR"].includes(error.code) ? "Refresh list" : "Try again"}</button>}</div>}
    {busy && !items.length && <div className="library-grid" aria-hidden="true">{[1, 2, 3].map((key) => <div className="project-card project-skeleton" key={key}><span /><span /><span /></div>)}</div>}
    <div className="library-grid" aria-busy={busy}>{items.map((project) => <article className="project-card" key={project.id}><div className="draft-art" aria-hidden="true"><Icon name="projects" /><span>One idea.<br />A new perspective.</span></div><div className="project-card-content"><div className="card-statuses"><span>{statusLabel(project.creationStatus)}</span><span>{statusLabel(project.publicationStatus)}</span></div><h3><Link href={`/projects/${project.id}`}>{project.title}</Link></h3><p>Updated <time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</time></p><Link className="project-open" href={`/projects/${project.id}`} aria-label={`Open ${project.title}`}>Open draft <span aria-hidden="true">↗</span></Link><DeleteProject id={project.id} title={project.title} revision={project.revision} onDeleted={() => void load()} /></div></article>)}</div>
    {!busy && loaded && !error && !items.length && !next && <div className="library-empty"><Icon name="projects" /><h2>{filtered ? "No projects match just yet." : "Give your first idea a home."}</h2><p>{filtered ? "Try a different title prefix or clear your filters." : "Start with a question. We’ll keep your draft here, ready when you are."}</p>{filtered ? <button className="button secondary" onClick={clearFilters}>Clear filters</button> : <Link className="button primary" href="/projects/new">Create your first draft</Link>}</div>}
    {!dashboard && next && <div className="library-more"><button className="button secondary" disabled={busy} onClick={() => void load(next)}>{busy ? "Loading…" : "Load more projects"}</button></div>}
  </section>;
}
