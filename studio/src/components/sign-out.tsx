"use client";
import { useState } from "react";
export function SignOut() {
  const [pending, setPending] = useState(false); const [failed, setFailed] = useState(false);
  async function signOut() {
    setPending(true); setFailed(false);
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      // Full navigation clears client-side protected page caches.
      window.location.replace("/sign-in");
    } catch { setFailed(true); setPending(false); }
  }
  return <div className="sign-out"><button className="button secondary" onClick={signOut} disabled={pending}>{pending ? "Signing out…" : "Sign out"}</button>{failed && <p role="alert">Couldn’t sign out. Please retry.</p>}</div>;
}
