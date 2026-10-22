# F05 — Project creation and persistence

Date: 2026-10-22. Scope: create an owned draft and reopen its saved detail page. No AI, storyboard, editor, project listing, deletion or publishing is enabled by this feature.

## Owner test

1. Sign in at `http://localhost:3001/sign-in`, then open `/projects/new` or choose **Create a draft** on Home.
2. Enter a project name and educational idea. Audience/niche are optional; target duration defaults to 75 seconds and accepts integers from 60–90.
3. Choose **Create draft**. The resulting `/projects/<id>` page shows the saved idea and settings.
4. Refresh the page. Bookmark its address, sign out/in, and return to confirm persistence. The project library arrives in F06; saved drafts are currently reopened by their URL.
5. Blank/oversize input should show validation feedback. A network failure preserves the form; retry the same unchanged details in the same tab. An interrupted response after a successful save reuses the original project.

The UI follows Mineral Signal tokens and the Plan stage of the approved design, with explicit draft creation instead of pretending later-stage AI/autosave controls are implemented. No application-created test account or draft is inserted into Atlas by the automated tests.

## Setup and migration

From `studio/` with Node 24 and the existing `.env.local`, run `npm run projects:migrate`, then `npm run projects:verify`. The explicit F05 migration follows F02/F03 and uses their shared migration lock, checksum and forward-only recovery. Runtime verifies the project schema and required indexes before creation; it never performs DDL. No new environment variables or dependencies are needed.

Creates strict `projects`, `idempotencyRecords`, and `auditEvents` collections. Unknown top-level fields are rejected. The draft schema includes all project reference fields, with unsupported production fields constrained to null and warnings to an empty array. Settings permit the current CLEAN caption default, no music, and optional existing profile voice preference. Future owning features must add versioned migrations to widen these constraints; never edit the applied F05 checksum. This is a staged implementation of the DB design, not its full production schema.

Indexes: active-owner creation listing, owner creation admission count, unique owner/method/route/key hash receipt scope, seven-day terminal receipt TTL, audit aggregate history, and 90-day audit TTL. Expired receipts are checked/deleted explicitly inside the transaction; TTL timing never determines authorization or replay behavior. Existing validators/indexes are checked for drift, not silently overwritten. If migration fails, inspect `schemaMigrations`, correct the underlying problem, and rerun the same migration. Do not steal its lock or drop user collections. No down migration is provided.

## HTTP contract

All endpoints require an active session. Unverified users can create/read drafts. Owners come exclusively from the server session. Responses have `{data,requestId}` or the documented application error envelope and `X-Request-Id`. No provider configuration, owner ID, DB `_id`, session ID or credential is included in the Project DTO.

| Endpoint | Request | Response |
| --- | --- | --- |
| GET `/api/v1/csrf` | Session cookie; no query | 200 `{data:{token},requestId}`; private/no-store. HMAC token is bound to the current user/session and expires after one hour. |
| POST `/api/v1/projects` | Same-origin JSON, `X-CSRF-Token`, `Idempotency-Key`; title, originalIdea, optional audience/niche, optional targetDurationSeconds | 201 Project DTO; Location points to API resource. Replay adds `Idempotent-Replay:true`. |
| GET `/api/v1/projects/:projectId` | Session cookie; no query; optional If-None-Match | 200 Project DTO, or 304 after ownership/lifecycle check. ETag includes ID and resourceVersion; private/no-cache. Missing/invalid/foreign/deleted project is 404. |

The create body is strict: title 1–120 Unicode code points, idea 1–5000, optional audience/niche 1–200, integer duration 60–90. Text is NFC-normalized and outer-trimmed. Optional fields are omitted, not null/blank; stored absence becomes null. Reject forbidden control characters, unknown fields, malformed UTF-8/JSON and duplicate JSON keys (including escaped equivalents). Maximum body is 256 KiB. Draft text is displayed literally, never interpreted as HTML or executed as instructions. Provider/content safety checks belong to generation; no providers are invoked here.

Failure codes: AUTH_REQUIRED401, CSRF_FAILED/ACCOUNT_DELETING403, RESOURCE_NOT_FOUND404, IDEMPOTENCY_CONFLICT409, PAYLOAD_TOO_LARGE413, UNSUPPORTED_MEDIA_TYPE415, VALIDATION_FAILED422, PRECONDITION_REQUIRED428 for missing retry key, RATE_LIMITED429, SERVICE_UNAVAILABLE503. Query parameters are rejected with INVALID_QUERY400; invalid/duplicate JSON is MALFORMED_JSON400. 429 and 503 include Retry-After. Field errors use JSON Pointer paths. Raw database exceptions are never returned.

The creation admission limit is 30 successful drafts/owner in a rolling minute, including drafts later deleted. It runs under the profile fence with the write. Replays do not create or count another draft. Broader API read/invalid-request rate limiting remains operational hardening; this is not a claim to implement every future rate bucket.

## Atomic save and retry behavior

T02 uses the shared majority/snapshot transaction helper. It increments the ACTIVE profile's technical fence, checks the scoped receipt, selects versioned defaults (`project-defaults-v1`), inserts a UUIDv7 draft, a terminal receipt, and a content-redacted audit event. No external calls or parallel session operations occur in the transaction. IDs and hashes are prepared before retries. Failure in any write rolls back the draft, receipt, audit and fence. Missing/deleting profiles cannot admit work.

The key is hashed and scoped to owner + POST + canonical route. The request hash includes the action and normalized validated fields in a fixed order. Same key/body returns the original successful DTO/status with a fresh requestId, after current access checks; different body returns409. Uniqueness races or a lost commit acknowledgement trigger a primary receipt lookup. There is no separately visible in-flight receipt for this short synchronous command: concurrent same-key requests converge through the transaction/unique scope to201; an unresolved transient failure returns503 and is retried with the same key.

The browser disables concurrent submission, preserves fields on errors, and retains the key for an unchanged request in the mounted form. Reloading the creation form loses that in-memory retry key; after an uncertain save, retry before reloading. Long-lived client recovery across reload is not claimed. A new payload gets a new key. Seven days after a safely terminal save the key can be reused; the original project is not deleted. F07 deletion will continue to enforce access on replay.

Draft defaults: revision/resourceVersion1, nextStoryboardVersion1, DRAFT/NOT_PUBLISHED, ACTIVE lifecycle, no jobs/storyboards/renders/approval, clean captions, no music, optional profile voice, and a 75-second target unless specified. No actual video duration is reported. Allowed actions currently contain OPEN only. Future actions must be added with their own authorization and state-transition implementation.

## Verification and handoff

`npm run test:projects` covers 12 real replica-set tests: migration repeatability, Unicode/unknown fields, defaults and audit redaction, owner isolation and deletion, concurrent idempotency/conflict, owner receipt scope, rollback, account lifecycle fence, CSRF/duplicate JSON/size/query/identity injection, conditional GET authorization, explicit expiry, schema/index drift, and admission limit. Browser automation also loses a successful POST response intentionally and proves the retry creates exactly one project. Tests use isolated databases.

Evidence and final build results are in `PROJECT_STATUS.md`. Stop for owner testing before F06 library/dashboard work.
