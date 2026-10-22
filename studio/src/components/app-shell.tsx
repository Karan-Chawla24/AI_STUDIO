"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";
import { SignOut } from "./sign-out";

const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/projects/new", label: "Create Video", icon: "create" },
  { href: "/projects", label: "Projects", icon: "projects" },
  { href: "/scheduled", label: "Scheduled", icon: "scheduled" },
  { href: "/connections", label: "Connections", icon: "connections" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function AppShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname();
  const active = navigation.find((item) => item.href === pathname);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <Link href="/home" className="brand" aria-label="Educational Video Studio home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>Educational Video<span className="brand-subtitle">Studio</span></span>
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label, icon }) => (
            <Link key={href} href={href} className="nav-link" aria-current={pathname === href ? "page" : undefined}>
              <Icon name={icon} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note"><span className="signal-dot" /> A little clarity goes a long way.</div>
      </aside>
      <div className="workspace">
        <header className="topbar"><span>{active?.label ?? "Studio"}</span><div className="account-actions"><span className="account-name">{userName}</span><SignOut /></div></header>
        <main id="main-content" tabIndex={-1}>{children}</main>
        <footer className="workspace-footer">Account access is ready to test · Saved projects are coming in a later milestone.</footer>
      </div>
    </div>
  );
}
