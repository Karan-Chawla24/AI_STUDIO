import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type AccountEmail = { to: string; kind: "verification" | "reset"; url: string };
export interface EmailSender { send(message: AccountEmail): Promise<void> }

/** Preview files are deliberately outside public/: never expose reset links over HTTP. */
export function createEmailSender(origin: string, env: Record<string, string | undefined> = process.env): EmailSender {
  const mode = env.EMAIL_DELIVERY;
  if (mode === "preview") {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname) || env.VERCEL) throw new Error("Email preview requires a local origin.");
    return { async send(message) {
      const directory = path.resolve(process.cwd(), ".local", "emails");
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(message, null, 2), { flag: "wx", mode: 0o600 });
    } };
  }
  if (mode !== "resend" || !env.RESEND_API_KEY || !env.EMAIL_FROM || /[\r\n]/.test(env.EMAIL_FROM)) throw new Error("Configure EMAIL_DELIVERY, RESEND_API_KEY and EMAIL_FROM.");
  return { async send(message) {
    const verification = message.kind === "verification";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": createHash("sha256").update(`${message.kind}:${message.to}:${message.url}`).digest("hex") },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: verification ? "Verify your studio email" : "Reset your studio password", text: `${verification ? "Confirm your email address" : "Choose a new password"} for Educational Video Studio.\n\n${message.url}\n\nThis link expires in ${verification ? "60" : "15"} minutes. If you did not request this, you can ignore this email.` }),
    });
    if (!response.ok) throw new Error("Account email delivery failed.");
  } };
}
