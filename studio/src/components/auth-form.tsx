"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";

export function AuthForm({ mode, registered = false }: { mode: "sign-in" | "sign-up"; registered?: boolean }) {
  const signup = mode === "sign-up";
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").normalize("NFC").trim();
    if (signup && (!name || [...name].length > 100)) { setError("Enter a name of 1–100 characters."); return; }
    if (password.length > 128 || (signup && password.length < 12)) { setError("Use a password of 12–128 characters."); return; }
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/auth/${mode}/email`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? "").trim(), password, ...(signup ? { name } : { rememberMe: form.get("remember") === "on" }), callbackURL: "/home" }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Too many attempts. Wait a minute and try again." : response.status >= 500 ? "Account services are temporarily unavailable. Please try again." : signup ? "We couldn’t complete registration. Try again or sign in to your account." : "The email or password is incorrect. Please try again.");
        return;
      }
      if (signup) router.replace("/sign-in?registered=1");
      else router.replace("/home");
      router.refresh();
    } catch { setError("We couldn’t connect. Check your connection and try again."); }
    finally { setPending(false); }
  }
  return <>
    <header className="auth-heading"><p className="eyebrow">A little clarity starts here</p><h1>{signup ? "Create your studio account" : "Sign in to your studio"}</h1><p>{signup ? "Turn complex topics into clear, visual explanations." : "Pick up your ideas. Bring the next explanation to life."}</p></header>
    {registered && <p className="auth-notice" role="status">Your account request is complete. Sign in with your email and password.</p>}
    <form className="auth-form" onSubmit={submit} aria-busy={pending}>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <fieldset disabled={pending}>
        {signup && <label htmlFor="name">Full name<input id="name" name="name" autoComplete="name" required maxLength={100} placeholder="Your name" /></label>}
        <label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>
        <label htmlFor="password">Password</label><div className="password-field"><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 12 : undefined} maxLength={128} aria-describedby={signup ? "password-hint" : undefined} /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></div>
        {signup && <p id="password-hint" className="field-hint">12–128 characters. Spaces and password managers are welcome.</p>}
        {!signup && <><label className="remember"><input name="remember" type="checkbox" defaultChecked />Remember me</label><Link href="/forgot-password">Forgot password?</Link></>}
        <button className="button primary auth-submit" type="submit">{pending ? signup ? "Creating your account…" : "Signing in…" : signup ? "Create account" : "Sign in"}<Icon name="arrow" /></button>
      </fieldset>
    </form>
    <p className="auth-switch">{signup ? "Already have an account?" : "New to the studio?"} <Link href={signup ? "/sign-in" : "/sign-up"}>{signup ? "Sign in" : "Create account"}</Link></p>
    <p className="auth-scope">Need to confirm your email? <Link href="/verify-email">Request a verification link</Link>.</p>
  </>;
}
