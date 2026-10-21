# F02 — Database foundation

Implemented 2026-10-21. This adds server infrastructure, not sign-in or saved-project UI.

## Scope

- Native MongoDB driver with a lazy, process-local shared connection pool. Importing modules and building the UI do not require credentials. Failed connections are cleared so a subsequent request can retry.
- Required server-only `MONGODB_URI` and `MONGODB_DB_NAME`; system databases and insecure TLS verification are rejected. Production connections require TLS. No `NEXT_PUBLIC_` database settings.
- Bounded connection/selection/queue timeouts and sanitized connection errors. Database internals are not exposed through an unauthenticated health endpoint.
- Transaction helper uses primary/snapshot/majority, closes sessions, and supports the driver's retry behavior. Callbacks must be sequential and contain no external effects.
- Explicit CLI commands for connectivity/topology, migration status, applying the operational bootstrap and verifying its schema/indexes. Nothing migrates during app startup.

## Configure a persistent database

Copy `studio/.env.example` to `studio/.env.local` and set an Atlas connection string and a dedicated database name. Keep credentials local. The example localhost URI only works if a replica set is already running; the test suite's temporary instance is not a development database.

From `studio/` with Node 24:

```sh
npm run db:check
npm run db:status
npm run db:migrate
npm run db:verify
```

`db:check` verifies connectivity and transaction-capable topology without creating data. `db:status` is read-only. `db:migrate` creates only `schemaMigrations`, a strict validator, its built-in unique `_id` index, and `migration_state_started`. `db:verify` checks the applied checksum, validator and index shape. Every CLI closes its connection and reports a nonzero exit code on failure.

Use a separate migration identity with collection/index-management privileges. The future application identity should only have its required CRUD privileges. Atlas roles/network rules must be configured separately; no cloud resource is provisioned here.

## Bootstrap migration record

- ID: `F02_0001_migration_control`. Owner: database foundation module.
- Checksum: SHA-256 of the checked-in validator and index definition.
- Expected duration: seconds for an empty database; no data backfill or product-data writes.
- Preflight: transaction-capable topology required by CLI. If the control collection exists, its strict/error validator must match exactly. Existing applied checksums must match. Existing mismatched indexes are rejected, not silently replaced.
- Backup checkpoint: empty database needs no data backup for this additive operation. For an existing deployment, take/verify an operator-managed backup before migrations. The CLI does not create backups.
- State: RUNNING → APPLIED or FAILED. Partial bootstrap failure is safe to rerun after inspection; creation/index operations are idempotent. Verification is also run on an already-applied migration.
- Recovery: forward-only. No rollback/drop command. Do not edit an applied migration definition; introduce a new migration when schemas change.
- Single-writer guard: unique `__migration_lock__` document in the control collection. Lease metadata records a ten-minute review deadline. There is deliberately no automatic expiry, TTL or lock takeover: a paused old process must not race a new migration process.
- Crash recovery: inspect status, confirm the previous process is stopped, inspect its database operations, and remove only the matching stale lock using an operator database session. Then rerun. Never clear a lock just because its timestamp expired.

This operational bootstrap precedes the DB design's M001 Better Auth adapter/schema export. It does not claim to implement that migration or any future domain migration. Auth collections, user profiles, project schemas and their indexes arrive with F03/F05 after the pinned auth adapter is inspected. No guessed auth schemas are created now.

## Local integration checks

```sh
npm run test:db
```

Tests use a temporary real MongoDB replica set via `mongodb-memory-server`; they never load `.env.local`. First run downloads a MongoDB binary (large on Windows); subsequent runs reuse its cache. Test data/processes are cleaned up on completion. This test dependency is development-only.

Coverage: missing/unsafe config, redacted connection failure, replica-set capability, migration reruns, strict validation, lock exclusion including expired locks, checksum/index drift, transaction rollback/commit, pooled-connection recovery and schema-drift refusal. These checks do not establish Atlas network connectivity, cloud role correctness, backups or future business transaction invariants.

Verified on 2026-10-21 with Node 24.19.0 and MongoDB 8.2.6: all 10 tests passed, including the CLI check/status/migrate/verify sequence. TypeScript, ESLint and the Next.js production build passed. Running `db:check` without configuration returned a sanitized `DB_CONFIG_INVALID` message and exit code 1, as expected. No persistent database was modified.
