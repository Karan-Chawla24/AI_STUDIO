"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type Mode = "forgot-password" | "reset-password" | "verify-email";
export function AccountEmailForm({ mode }: { mode: Mode }) {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    function readLink() {
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (value) { setToken(value.length <= 2048 ? value : ""); setDone(false); setError(""); setNotice(""); setCooldown(0); }
      window.history.replaceState(null, "", window.location.pathname);
      setReady(true);
    }
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const verify = mode === "verify-email";
  const reset = mode === "reset-password";
  const confirm = reset || (verify && !!token);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || cooldown || !ready) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (reset && (password.length < 12 || password.length > 128)) { setError("Use a password of 12–128 characters."); return; }
    if (reset && password !== form.get("confirm-password")) { setError("Your passwords do not match."); return; }
    setPending(true); setError(""); setNotice("");
    const endpoint = reset ? "reset-password" : verify ? token ? "verify-email" : "send-verification-email" : "request-password-reset";
    try {
      const response = await fetch(`/api/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(confirm ? { token, ...(reset ? { newPassword: password } : {}) } : { email: String(form.get("email") ?? "").trim() }) });
      if (!response.ok) {
        if (response.status === 429) { setCooldown(60); setError("Please wait a minute before trying again."); }
        else setError(confirm ? "This link is invalid or expired. Request a new link below." : "We couldn’t process your request. Check the email address and try again.");
        return;
      }
      if (confirm) { setDone(true); setToken(""); }
      else { setNotice("If this address is eligible, check your email for a link. You can request another in a minute."); setCooldown(60); }
    } catch { setError("We couldn’t connect. Please try again."); }
    finally { setPending(false); }
  }
  return <>
    <header className="auth-heading"><p className="eyebrow">Your studio, protected</p><h1>{done ? reset ? "Password updated" : "Email verified" : reset ? "Set a new password" : verify ? "Verify your email" : "Forgot your password?"}</h1><p>{done ? reset ? "Your previous sessions have been signed out. Sign in with your new password." : "You’re ready for the next step. Return to your studio or sign in." : reset ? "Choose a strong password you haven’t used before." : verify ? token ? "Confirm that this is your email address to finish verification." : "Enter your account email and we’ll send a verification link." : "We’ll send a link to help you get back to your ideas."}</p></header>
    {!done && <form className="auth-form" onSubmit={submit} aria-busy={pending}>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {reset && ready && !token ? <p className="auth-error">Open the link from your reset email. If it has expired, request a new one.</p> : <fieldset disabled={pending || !ready}>
        {!confirm && <label htmlFor="email">Email address<input id="email" name="email" type="email" required autoComplete="email" maxLength={254} placeholder="you@example.com" /></label>}
        {reset && <><label htmlFor="password">New password<input id="password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label><label htmlFor="confirm-password">Confirm new password<input id="confirm-password" name="confirm-password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label><p className="field-hint">12–128 characters. Spaces and password managers are welcome.</p></>}
        <button className="button primary auth-submit" disabled={cooldown > 0} type="submit">{pending ? "Please wait…" : cooldown ? `Try again in ${cooldown}s` : reset ? "Update password" : verify ? token ? "Confirm email address" : "Send verification link" : "Send reset link"}</button>
      </fieldset>}
    </form>}
    <p className="auth-switch"><Link href="/sign-in">Back to sign in</Link>{done && verify && <> · <Link href="/home">Open studio</Link></>}</p>
    {confirm && !done && <p className="auth-switch"><a href={verify ? "/verify-email" : "/forgot-password"}>Request a new link</a></p>}
  </>;
}
