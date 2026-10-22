import "server-only";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getDatabase, type DatabaseConnection } from "../db/client";
import { authPolicy, readAuthConfig } from "./config";
import { provisionProfile, type UserProfile } from "./profile";
import { verifyAuthSchema, withPrebuiltIndexes } from "./schema";

export function createAuth(connection: DatabaseConnection, config: ReturnType<typeof readAuthConfig>) {
  return betterAuth({
    ...authPolicy, secret: config.secret, baseURL: config.origin, trustedOrigins: [config.origin],
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
