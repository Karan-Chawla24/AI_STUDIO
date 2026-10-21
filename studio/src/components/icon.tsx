export type IconName = "home" | "create" | "projects" | "scheduled" | "connections" | "settings" | "arrow";

const paths: Record<IconName, string> = {
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  create: "M12 5v14M5 12h14",
  projects: "M3 7V5h7l2 3h9v12H3V7Z",
  scheduled: "M8 3v4m8-4v4M3 10h18M4 5h16v16H4V5Zm4 9h3m2 3h3",
  connections: "m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
