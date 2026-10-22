import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { createHash } from "node:crypto";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getDatabase, type DatabaseConnection } from "../db/client";
import { authPolicy, readAuthConfig } from "./config";
import { provisionProfile, type UserProfile } from "./profile";
import { verifyAuthSchema, withPrebuiltIndexes } from "./schema";
import { createEmailSender, type EmailSender } from "./email";

export function createAuth(connection: DatabaseConnection, config: ReturnType<typeof readAuthConfig>, sender?: EmailSender) {
  const send: EmailSender = sender ?? { async send(message) { await createEmailSender(config.origin).send(message); } };
  const auth = betterAuth({
    ...authPolicy, secret: config.secret, baseURL: config.origin, trustedOrigins: [config.origin],
    emailAndPassword: { ...authPolicy.emailAndPassword,
      resetPasswordTokenExpiresIn: 15 * 60, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        await send.send({ to: user.email, kind: "reset", url: `${config.origin}/reset-password#token=${encodeURIComponent(token)}` });
      },
    },
    emailVerification: {
      sendOnSignUp: false, sendOnSignIn: false, autoSignInAfterVerification: false, expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, token }): Promise<void> => {
        const context = await authContext;
        await context.internalAdapter.createVerificationValue({ identifier: `email-confirm:${createHash("sha256").update(token).digest("hex")}`, value: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
        await send.send({ to: user.email, kind: "verification", url: `${config.origin}/verify-email#token=${encodeURIComponent(token)}` });
      },
      afterEmailVerification: async (user) => {
        await connection.db.collection<UserProfile>("userProfiles").updateOne({ _id: user.id, lifecycle: "ACTIVE", emailVerified: false }, { $set: { emailVerified: true, updatedAt: new Date() }, $inc: { version: 1 } });
      },
    },
    hooks: { before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/verify-email") {
        const token = ctx.query?.token;
        if (typeof token !== "string") throw new APIError("BAD_REQUEST", { code: "INVALID_TOKEN", message: "Request a new verification link." });
        const value = await ctx.context.internalAdapter.consumeVerificationValue(`email-confirm:${createHash("sha256").update(token).digest("hex")}`);
        if (!value || value.expiresAt <= new Date()) throw new APIError("BAD_REQUEST", { code: "INVALID_TOKEN", message: "Request a new verification link." });
        const profile = await connection.db.collection<UserProfile>("userProfiles").findOne({ _id: value.value });
        if (!profile || profile.lifecycle !== "ACTIVE") throw new APIError("BAD_REQUEST", { code: "INVALID_TOKEN", message: "Request a new verification link." });
      }
    }) },
    database: mongodbAdapter(withPrebuiltIndexes(connection.db), { client: connection.client }),
    advanced: {
      useSecureCookies: config.secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      ipAddress: { ipAddressHeaders: ["x-studio-client-ip"] },
    },
    databaseHooks: {
      user: { create: { after: async (user) => { await provisionProfile(connection.db, user); } } },
      session: { create: { before: async (session) => {
        const profile = await connection.db.collection<UserProfile>("userProfiles").findOne({ _id: session.userId });
        if (profile && profile.lifecycle !== "ACTIVE") return false;
      } } },
    },
  });
  const authContext: Promise<Pick<Awaited<ReturnType<typeof betterAuth>["$context"]>, "internalAdapter">> = auth.$context;
  return auth;
}

let current: Promise<ReturnType<typeof createAuth>> | undefined;
export function getAuth() {
  if (!current) current = (async () => {
    const config = readAuthConfig();
    const connection = await getDatabase();
    await verifyAuthSchema(connection.db);
    return createAuth(connection, config);
  })().catch((error: unknown) => { current = undefined; throw error; });
  return current;
}

export async function activeIdentity(auth: ReturnType<typeof createAuth>, connection: DatabaseConnection, headers: Headers) {
  const identity = await auth.api.getSession({ headers });
  if (!identity) return null;
  const profile = await provisionProfile(connection.db, identity.user);
  if (!profile || profile.lifecycle !== "ACTIVE") return null;
  return { user: identity.user, profile };
}

export async function getIdentity(headers: Headers) {
  return activeIdentity(await getAuth(), await getDatabase(), headers);
}
