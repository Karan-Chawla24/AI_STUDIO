import Link from "next/link";
import { Icon, type IconName } from "./icon";

export function FeaturePlaceholder({ title, description, icon, detail }: {
  title: string; description: string; icon: IconName; detail: string;
}) {
  return <div className="page-content">
    <div className="page-heading"><p className="eyebrow">Your studio</p><h1>{title}</h1><p className="lead">{description}</p></div>
    <section className="empty-panel" aria-labelledby="feature-state">
      <span className="empty-icon"><Icon name={icon} /></span>
      <span className="status-label">Coming in a later milestone</span>
      <h2 id="feature-state">{detail}</h2>
      <p>This page establishes the layout. This feature is not available yet.</p>
      <Link className="button secondary" href="/home">Back to Home<Icon name="arrow" /></Link>
    </section>
  </div>;
}
