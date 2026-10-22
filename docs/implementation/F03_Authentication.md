# F03 — Authentication and first owner test

Date: 2026-10-22. This milestone adds account access only. Stop for owner review before F04.

## What is implemented

- Mineral Signal sign-up and sign-in pages with password visibility, password-manager support, pending/error states and a remember-me option.
- Better Auth and MongoDB adapter pinned to 1.7.12. Native password hashing, session creation and revocation; no custom password storage.
- Passwords: 12–128 characters for registration, never trimmed. Names normalized to NFC and bounded to 100 code points. Email normalized by the library.
- Explicit sign-in after registration. Duplicate registration uses the library's generic response; invalid login messages do not distinguish unknown emails from incorrect passwords.
- Server-protected studio shell and owner-scoped `GET /api/v1/me`, with private/no-store responses and request IDs. No client-supplied owner identifier.
- Seven-day persistent sessions with a one-day refresh interval; remember-me off uses the library's nonpersistent cookie behavior. Cookie cache disabled so revocation/lifecycle checks use the database.
- HttpOnly, SameSite=Lax, host-only cookies; Secure when APP_ORIGIN uses HTTPS. HTTP is allowed only for a loopback origin during local testing.
- Sign-out revokes the session and performs a full navigation to discard protected client caches. A deleting/deleted profile cannot use an existing session or create a new one.
- Exact origin and cross-site checks for POSTs, JSON content type, a 16 KiB body cap, fixed callback and allowed fields/endpoints. Native auth responses retain the SDK's envelope; `/api/v1/me` uses the application's envelope.
- Database-backed native rate limiting enabled even in development: ten sign-in attempts/minute, five registrations/minute. Local testing shares one IP bucket; Vercel uses its platform-controlled forwarding header. Review proxy configuration before hosting elsewhere.

## Database migration

`auth:migrate` first verifies/applies the existing operational bootstrap, then runs `F03_0001_auth_1_7_12`. It uses the existing single-writer migration lock and checksum/state records. The earlier bootstrap checksum remains unchanged.

Auth schemas/indexes are derived from the installed adapter through `getSchema`, exported as `F03_Auth_Adapter_Schema.json`. Native auth collections are adapter-owned (ObjectId internally, canonical string user IDs in the API/profile); no hand-built auth-field validators. A separate strict `userProfiles` schema stores domain preferences/lifecycle, with its `_id` matching the canonical auth user ID. Defaults are UTC, no selected voice, ACTIVE and unverified projection. Trusted auth identity, not the projection, controls verification status.

Profile provisioning is idempotent in the user creation after-hook and repaired lazily on authenticated access. User creation and profile provisioning are not claimed to be a single atomic transaction; a profile-hook failure can leave an auth user, recovered on later sign-in. Existing lifecycle fences are never overwritten.

The adapter normally asks to create its indexes on writes. Our DB facade verifies that the prebuilt index already matches and returns its name; it does not create or alter indexes at runtime. Migrations use the real driver and a migration-capable identity. Runtime must be able to read/list its auth indexes and perform required CRUD, but need not perform index DDL.

Migration is additive and forward-only, expected to finish in seconds on an empty database. Existing collections/indexes are preserved; duplicate data or mismatched validators/indexes fail safely. Take an operator-managed backup before applying to a populated deployment. Never modify an applied migration checksum. Future schema changes require a new versioned migration. Stale-lock recovery follows F02; there is no automatic lock stealing or destructive rollback.

## Configuration and commands

Set these only in ignored `studio/.env.local`:

- `MONGODB_URI`: Atlas replica-set connection string.
- `MONGODB_DB_NAME`: chosen application database. Uppercase letters and hyphens are now accepted; system names remain blocked case-insensitively.
- `APP_ORIGIN`: `http://localhost:3001` for this local preview. Use this exact hostname in the browser.
- `BETTER_AUTH_SECRET`: generated random secret, at least 32 characters. Already generated locally; not committed.

From `studio/`, using Node 24:

```sh
npm run db:check
npm run auth:migrate
npm run auth:verify
npm run dev -- --port 3001
```

The current Atlas connection and authentication migration were successfully verified on 2026-10-22. No test accounts were created in Atlas by the automated test suite; automated accounts live only in temporary local databases.

## Owner test checklist

1. Open `http://localhost:3001/sign-up`. Create a test account with your name, email and a password of at least 12 characters. You should land on sign-in with an acknowledgement.
2. Enter an incorrect password. You should get a readable error and remain signed out.
3. Sign in with the correct password. Home should show your name and a Sign out button.
4. Refresh. You should remain signed in.
5. Open `http://localhost:3001/api/v1/me` in the same browser. It should return your profile and no password/hash or session token.
6. Sign out, then visit `/home` or `/projects`. You should be sent to sign-in. An incognito window should also be unable to open the dashboard without signing in.
7. Check the forms on your phone-sized browser window and try Show/Hide password and keyboard navigation.

If you trigger rate limiting, wait one minute before trying again. If your Atlas IP changes, update its network access list. Do not paste credentials into chat or GitHub.

## Explicit limits

Email verification and password recovery are F04 and are not enabled or linked as working actions. Accounts remain unverified. No AI/generation/publishing capabilities are enabled for these accounts. The remaining dashboard pages are still feature placeholders. Legal copy and public launch are not part of this milestone.

This is a local functional test, not a production launch. Atlas runtime/migration role separation, production email, proxy trust configuration, monitoring and deployment hardening remain launch work.

## References

- [Better Auth MongoDB adapter](https://better-auth.com/docs/adapters/mongo)
- [Better Auth email/password](https://better-auth.com/docs/authentication/email-password)
- [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit)
- Local pinned Next.js authentication and Route Handler guides under `node_modules/next/dist/docs/`.
