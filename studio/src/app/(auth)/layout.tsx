import Link from "next/link";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth-page"><header className="auth-brand"><Link className="brand" href="/sign-in"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Educational Video<span className="brand-subtitle">Studio</span></span></Link><span className="preview-badge">Your ideas, explained.</span></header><main className="auth-card">{children}</main><footer className="auth-footer"><span className="signal-dot" />One idea. A new perspective.</footer></div>;
}
