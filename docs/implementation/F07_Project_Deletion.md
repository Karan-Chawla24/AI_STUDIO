# F07 — Project deletion

Implemented 2026-10-23. Scope: owned saved drafts. Better Auth remains the authentication system.

## Setup and operation

From studio with Node 24 and the existing environment:

```
npm run deletion:migrate
npm run deletion:verify
npm run deletion:worker
```

Keep the worker supervised alongside the web process. It scans up to 50 accepted jobs every five seconds. A web after-response callback attempts immediate cleanup; the durable worker recovers callbacks lost to process interruption. `npm run deletion:drain` runs one bounded recovery batch. No Gemini, media, Inngest or publishing services are required. No new environment variables.

Migration F07_0001_project_deletion is forward-only. It expands idempotency/audit validators, creates deletionJobs with strict validation, adds unique scope/target and backlog indexes, and adds terminal-job and deleted-project expiry indexes. F05 definitions/checksums remain immutable; compatibility verification accepts exactly the original or F07 expanded validators. A failed migration can be rerun after resolving the cause; never drop collections or remove the migration lock without operator investigation. Existing project content is not changed by migration. Atlas credentials require collMod and index creation permissions.

## API and transaction

DELETE /api/v1/projects/:projectId requires the session, exact Origin, session CSRF token, JSON content type, Idempotency-Key and body `{expectedRevision, confirmation:"DELETE_PROJECT"}`. Unknown fields, invalid revisions and confirmation values are rejected. Unverified active accounts can delete their drafts.

Returns 202 with `{data:{deletionId,state:"ACCEPTED"},requestId}` and a Location header pointing to /api/v1/deletions/:deletionId. This acknowledges durable acceptance, not completed cleanup. GET on that location is owner-only, remains available independently of the deleted project, and returns id, scope, state, resourceVersion and updatedAt in the normal envelope. Responses are private/no-store. Receipt reads check expiry explicitly.

The acceptance transaction touches the ACTIVE profile fence, checks a scoped retry receipt and project ownership/revision, transitions ACTIVE → DELETING, increments resourceVersion and publication epoch, blocks publication, and inserts the deletion job, terminal acceptance receipt and content-redacted audit. Failed writes roll the whole transaction back. A stale revision returns 409 REVISION_CONFLICT; missing/foreign/deleted projects return 404. Account deletion blocks access with 403. Authentication/CSRF failures retain existing 401/403 behavior.

An unchanged same-key retry replays the original 202 even after cleanup, with Idempotent-Replay:true. Changed payloads return 409 IDEMPOTENCY_CONFLICT. Different keys cannot create a second deletion job for the target. The UI retains its retry key while mounted; after navigation/reload a missing draft is already inaccessible, and a new deletion attempt returns 404. This is not a cross-reload client intent journal.

## Cleanup and retention

Normal reads, lists, counts and creation replays exclude the draft immediately after acceptance. Cleanup is one MongoDB transaction because current drafts have no external resources: redact title/idea/audience/niche/voice/duration, transition the project to DELETED, clear content-bearing creation receipt bodies, and mark the job COMPLETED. Concurrent cleanup executions are safe through transactional write conflicts. Redacted creation receipts remain until their normal seven-day expiry, preventing an old create retry from resurrecting the draft. Minimal project tombstones preserve creation admission accounting and expire after 90 days; only DELETED projects qualify. Completed jobs expire after 90 days; pending/attention jobs have no expiry. Content-redacted audits expire after 90 days.

F07 job states are ACCEPTED → COMPLETED, or REQUIRES_ATTENTION if a cleanup precondition is inconsistent. CLEANING is not persisted because the current work commits atomically without external calls. Unexpected errors leave ACCEPTED for retry. Unsupported resource pointers fail closed; this worker must be extended before enabling storyboards, renders, running jobs, schedules or publication. Their cancellation, reference-aware storage deletion, late-upload sweeping and WAITING_EXTERNAL reconciliation remain owned by later milestones. Already published third-party posts must never be silently deleted. Backup expiry is separate from live-data cleanup.

## UI and owner test

Delete actions appear on project cards and saved draft details. The native modal names the project, states the irreversible effect, traps focus and starts on Keep project. Escape/cancel leave data unchanged. While submitting, repeated clicks and cancellation are disabled. Errors retain retry state; stale/missing projects offer a list refresh. Acceptance removes the draft from the visible library and subsequent dashboard reads.

1. Create a disposable test draft and open Delete project.
2. Choose Keep project or Escape and confirm the draft still exists.
3. Open Delete project again and choose Delete permanently.
4. Confirm it disappears from Projects/Home and the saved detail URL no longer opens.
5. Repeat on a narrow screen if desired. Only delete drafts you intend to remove.

Automated tests use temporary MongoDB replica sets, never owner data. See F07-browser-verification.json and PROJECT_STATUS.md for completed checks. F08 editor/autosave is the next separate milestone.

Atlas activation note: the current database user was denied collMod on AI_Studio.idempotencyRecords. F07 is verified in isolation but requires that migration permission before Atlas deletion can be tested. The failed migration is retryable after permissions are corrected. Do not start the cleanup worker until verification succeeds.
