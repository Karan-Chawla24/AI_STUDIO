import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return <div className="page-content">
    <div className="page-heading"><p className="eyebrow">A space for your next explanation</p><h1>Good ideas deserve<br />a clear picture.</h1><p className="lead">Shape what you know into something worth watching.</p></div>
    <section className="intro-panel" aria-labelledby="intro-title">
      <div className="intro-copy"><span className="status-label">From a question to a story</span><h2 id="intro-title">Make the complex<br />feel simple.</h2><p>Start with an idea. Shape the story, bring it to life, and share what matters.</p><Link className="button primary" href="/projects/new">Explore video creation<Icon name="arrow" /></Link><small>Creation becomes available in an upcoming milestone.</small></div>
      <div className="story-graphic" role="img" aria-label="An idea becomes a plan, a storyboard, then a video">
        <div className="graphic-grid" />
        <div className="idea-card"><span className="signal-dot" /> A curious question<div>How does the<br /><strong>internet work?</strong></div></div>
        <div className="graphic-connector" />
        <div className="frame-card"><span className="frame-label">01 / THE CONNECTION</span><div className="network"><span>YOU</span><i /><span>WORLD</span></div><div className="caption-sample">It starts with a connection.</div></div>
        <span className="graphic-tag">One idea. A new perspective.</span>
      </div>
    </section>
    <section className="journey" aria-label="Video creation workflow">
      {[
        ["01", "Plan", "Find the heart of your idea."],
        ["02", "Storyboard", "Give every scene a purpose."],
        ["03", "Generate", "Bring words and motion together."],
        ["04", "Publish", "Put your explanation out there."],
      ].map(([number, title, description]) => <div key={number}><span className="step-number">{number}</span><h3>{title}</h3><p>{description}</p></div>)}
    </section>
    <section className="projects-preview" aria-labelledby="projects-title"><div className="section-heading"><h2 id="projects-title">Your projects</h2><Link href="/projects">Explore projects <span aria-hidden="true">↗</span></Link></div><div className="quiet-empty"><Icon name="projects" /><div><h3>A home for everything you create.</h3><p>Your saved projects will appear here once accounts and project storage are connected.</p></div></div></section>
  </div>;
}
