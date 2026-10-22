import "server-only";

export class DatabaseError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

export type DatabaseConfig = { uri: string; database: string; production: boolean };

export function readDatabaseConfig(env: Record<string, string | undefined> = process.env): DatabaseConfig {
  const uri = env.MONGODB_URI?.trim();
  const database = env.MONGODB_DB_NAME?.trim();
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new DatabaseError("DB_CONFIG_INVALID", "Set MONGODB_URI to a MongoDB connection string.");
  }
  if (!database || !/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(database) || ["admin", "local", "config"].includes(database.toLowerCase())) {
    throw new DatabaseError("DB_CONFIG_INVALID", "Set MONGODB_DB_NAME to a dedicated application database using letters, digits, underscores or hyphens.");
  }
  const production = env.NODE_ENV === "production";
  const options = new URLSearchParams(uri.split("?")[1] ?? "");
  for (const [key, value] of options) {
    const name = key.toLowerCase();
    if ((["tlsinsecure", "tlsallowinvalidcertificates", "tlsallowinvalidhostnames"].includes(name) && value.toLowerCase() !== "false") ||
        (production && ["tls", "ssl"].includes(name) && value.toLowerCase() !== "true")) {
      throw new DatabaseError("DB_CONFIG_INVALID", "Database TLS verification cannot be disabled; production requires TLS.");
    }
  }
  return { uri, database, production };
}
