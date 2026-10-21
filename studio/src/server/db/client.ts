import "server-only";
import { MongoClient, type ClientSession, type Db } from "mongodb";
import { DatabaseError, readDatabaseConfig, type DatabaseConfig } from "./config";

export type DatabaseConnection = { client: MongoClient; db: Db };

export async function connectDatabase(config: DatabaseConfig): Promise<DatabaseConnection> {
  let client: MongoClient | undefined;
  try {
    client = new MongoClient(config.uri, {
      appName: "educational-video-studio",
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      waitQueueTimeoutMS: 5_000,
      readPreference: "primary",
      writeConcern: { w: "majority" },
      ...(config.production ? { tls: true } : {}),
    });
    await client.connect();
    const db = client.db(config.database);
    await db.command({ ping: 1 }, { timeoutMS: 5_000 });
    return { client, db };
  } catch {
    await client?.close().catch(() => undefined);
    // Driver messages can contain connection credentials or hostnames.
    throw new DatabaseError("DB_CONNECTION_FAILED", "Cannot connect to the database. Check configuration, network access and credentials.");
  }
}

const globalDatabase = globalThis as typeof globalThis & { studioDatabase?: Promise<DatabaseConnection> };

/** Lazy connection: imports and Next builds do not require database credentials. */
export function getDatabase(): Promise<DatabaseConnection> {
  if (!globalDatabase.studioDatabase) {
    globalDatabase.studioDatabase = connectDatabase(readDatabaseConfig()).catch((error: unknown) => {
      globalDatabase.studioDatabase = undefined;
      throw error;
    });
  }
  return globalDatabase.studioDatabase;
}

/** CLI/test shutdown only; request handlers must not close the shared pool. */
export async function closeDatabase(): Promise<void> {
  const connection = globalDatabase.studioDatabase;
  globalDatabase.studioDatabase = undefined;
  await (await connection)?.client.close();
}

export async function assertTransactionSupport(db: Db): Promise<void> {
  const hello = await db.command({ hello: 1 }, { timeoutMS: 5_000 });
  if ((!hello.setName && hello.msg !== "isdbgrid") || hello.logicalSessionTimeoutMinutes == null) {
    throw new DatabaseError("DB_TRANSACTIONS_REQUIRED", "Use a MongoDB replica set or sharded deployment with transaction support.");
  }
}

/** Callback may run again. Prepare IDs first; no external calls or parallel session operations. */
export async function inTransaction<T>(client: MongoClient, work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = client.startSession();
  try {
    return await session.withTransaction(() => work(session), {
      readPreference: "primary",
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: 10_000,
      timeoutMS: 30_000,
    });
  } finally {
    await session.endSession();
  }
}
