import "server-only";
import type { BetterAuthOptions } from "better-auth";
import { DatabaseError } from "../db/config";

export function readAuthConfig(env: Record<string, string | undefined> = process.env) {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new DatabaseError("AUTH_CONFIG_INVALID", "Set BETTER_AUTH_SECRET to a random secret of at least 32 characters.");
  let url: URL;
  try { url = new URL(env.APP_ORIGIN ?? ""); } catch { throw new DatabaseError("AUTH_CONFIG_INVALID", "Set APP_ORIGIN to the exact application origin."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
    throw new DatabaseError("AUTH_CONFIG_INVALID", "APP_ORIGIN must be HTTPS, or HTTP on localhost, without a path or credentials.");
  }
  return { secret, origin: url.origin, secure: url.protocol === "https:" };
}

export const authPolicy = {
  appName: "Educational Video Studio",
  basePath: "/api/auth",
  emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, autoSignIn: false, requireEmailVerification: false },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
  rateLimit: {
    enabled: true, storage: "database", window: 60, max: 100,
    customRules: { "/sign-in/email": { window: 60, max: 10 }, "/sign-up/email": { window: 60, max: 5 } },
  },
  logger: { disabled: true },
} satisfies BetterAuthOptions;
