# F14 — Durable planning jobs and outbox

The owner authorized this feature and local Inngest testing on 2026-10-31. MongoDB remains the source of truth; Inngest delivers work. This release covers the existing idea, storyboard, scene regeneration and compilation jobs. It does not introduce narration, rendering, publication, cloud deployment or billing.

## Owner test

1. Open a project, generate a storyboard or compile scenes, and reload while it is queued/running. The persisted job should continue.
2. Cancel a queued request. It should finish cancelled without provider work. Running cancellation waits for the provider to settle and does not install its result.
3. For a known failed request, use **Retry request**. It creates a linked job with the same immutable input; the previous failure remains in history. Retry is also available after cancellation. A chain has at most three admitted attempts, including cancelled attempts. Retries also count toward the existing twenty-planning-requests-per-hour limit.
4. Change the project plan before retrying a failure. The server must require a new request rather than silently using edited input.
5. Uncertain provider outcomes remain blocked for operator review. They have no browser retry action. No automatic provider resend occurs.

Atlas migration and independent verification passed on 2026-10-31. Services were restored and health-checked on 2026-11-10; dispatcher and cleanup worker report ready. The local Inngest dashboard runs at http://127.0.0.1:8288. The application remains at http://localhost:3001. Development services must remain running for dispatch. Stop for owner testing before F15.

## Admission and delivery

The existing owner/profile transaction fence protects job admission. In the same transaction, admission writes the immutable job snapshot, project active-job pointer, HTTP idempotency receipt, retry-chain record and `outboxEvents` record. An outbox write failure rolls back the entire admission. The F14 receipt is required before accepting jobs; missing migrations fail closed.

The dispatcher claims a due event with a unique holder and incrementing epoch. Its lease lasts 30 seconds. It sends only the event ID and job ID through the Inngest SDK. Success marks DELIVERED using the matching epoch; failure releases to PENDING with exponential backoff capped at five minutes. An expired CLAIMED record can be reclaimed. A stale sender cannot acknowledge a replacement's lease. Delivery failures have no finite discard limit: pending records are retained until infrastructure recovers.

An acknowledgement lost after a successful send causes redelivery with the same event ID. Consumer-side protection is independent of broker deduplication: the database transaction validates the committed event, writes `inboxEvents`, claims a QUEUED job and writes a provider SENT journal and a planning `jobSteps` record. Duplicate delivery cannot claim RUNNING or terminal work. No prompt, credential, audio or generated content enters an event payload.

Inngest functions use two retries for infrastructure invocation failures and concurrency two for planning. These retries do not mean two additional provider sends. The SENT journal and job state prohibit automatic resend after an ambiguous call. The recovery cron runs every minute; a local dispatcher polls every three seconds for lower latency. Both use the same database claim logic.

## Leases, cancellation and recovery

Planning execution leases last three minutes and heartbeat every 30 seconds. The existing provider adapter has a two-minute request timeout. Heartbeats require matching holder/epoch, RUNNING state and an unexpired lease. Finalization also requires an unexpired matching lease. A worker that loses its lease cannot install output.

Recovery also checks active QUEUED jobs whose outbox event was delivered at least five minutes ago. If no consumer inbox, step or provider-call evidence exists, it transactionally marks the job FAILED with DISPATCH_NOT_CLAIMED, releases the project and terminalizes accepted receipts. The owner can use the normal bounded retry, which creates a new job/event ID. Late delivery of the failed job cannot call the provider. A concurrent claim either wins or conflicts with recovery; recorded execution evidence is held for operator review instead of being declared safe. Recent deliveries and undelivered events retain normal queue handling.

Recovery marks expired RUNNING jobs REQUIRES_ATTENTION, changes SENT provider journals to OUTCOME_UNKNOWN, and retains project admission and the accepted receipt. It does not repeat the provider call. A delayed original response is fenced. Successful completed proposal/snapshot records remain immutable and are never overwritten by retries.

Queued cancellation is terminal before any call. Running cancellation is cooperative: the flag and finalizer conflict on the same job transaction. When cancellation commits first, a later successful response cannot mark the job SUCCEEDED. Existing project deletion fences also prevent resurrection.

Operator settlement is service-only:

```text
node --conditions=react-server --import tsx scripts/jobs.ts settle JOB_ID VERSION OPERATOR "Reason after checking provider records" --accept-duplicate-cost
```

This records an immutable resolution, releases local admission and leaves the provider's unknown journal intact. It never fabricates success or sends another request. Only after explicit risk acceptance can the owner request a new bounded attempt. A stale version or repeated settlement is rejected. Never invoke settlement as an automatic repair.

## API addendum

`POST /api/v1/projects/:projectId/jobs/:jobId/retry`

- Existing session authentication, active owner/profile fence, verified email, same-origin CSRF and a 16–128-character Idempotency-Key are required.
- Request is exactly `{ "expectedVersion": <positive integer> }`. Changing input requires the original generation endpoint, not retry.
- A successful 202 response uses the existing envelope and includes `operationId`, `jobId`, `retryOfJobId`, `retryRootId`, `attempt`, `state`, `statusUrl`, `pollAfterMs`. Location and Retry-After headers match the other async commands.
- Same key/body replays the same accepted result. Different details under the same key conflict.
- Only safe FAILED/CANCELLED jobs with unchanged project revision and no active work may retry. Foreign-owned resources remain 404.
- Errors: VERSION_CONFLICT, JOB_NOT_RETRYABLE, PROJECT_BUSY, PROPOSAL_STALE, JOB_ALREADY_RETRIED, RETRY_LIMIT_REACHED (409), EMAIL_NOT_VERIFIED (403), and existing auth/CSRF/input/precondition errors.
- Job reads/history now expose `retryOfJobId`, `attempt` and RETRY when a remaining, unbranched safe retry is available. The mutation rechecks project revision and all guards; list hints are not authorization.

## Database addendum

`F14_0001_durable_planning` is forward-only and preserves prior checksums and indexes. It adds strict/error validators and the following indexes:

| Collection | Purpose / indexes |
| --- | --- |
| outboxEvents | Unique aggregate type + ID + version + event type; state/nextAttemptAt dispatch; state/lease expiry recovery |
| inboxEvents | Unique consumer/eventId; APPLIED commits with job claim |
| jobAttempts | `_id` is job ID; unique root/attempt and unique non-null parent prevent retry branching; attempts 1–3 |
| jobSteps | One `planning` step per job, unique job/stepKey, input hash, lease and result state |
| jobResolutions | Unique job resolution with operator, reason and explicit duplicate-cost acknowledgement |

The existing idempotency route validator gains `/jobs/:id/retry`. Historical verifiers recognize that exact additive shape without changing their migration checksums. Existing jobs receive root attempt records; only active QUEUED jobs receive dispatch events. Backfill uses set-on-insert and never repeats provider work. Rerunning an applied migration verifies; interrupted application can recreate missing new indexes and resume backfill. No new indexes replace old ones.

Retry metadata lives in `jobAttempts` rather than rewriting old job documents. This is an implementation addendum to the design's inline retry fields; the public API exposes the same relationship. Existing project active pointers and unique active-job index remain the planning admission reservation. Daily video quotas, owner video reservations, render slots and per-scene artifact reuse arrive with F15/F16; they are not advertised here.

Control records have no TTL in this release. Retention is deliberately conservative: unresolved calls and durable deduplication evidence must not expire. They contain IDs/hashes/state, not raw prompts. Provider and resolution history remain after local project content cleanup. An operational retention policy is required before production launch.

## Local setup and operations

```text
npm run jobs:migrate
npm run jobs:verify
npm run inngest:dev
npm run jobs:worker
npm run jobs:status
```

Set `INNGEST_DEV=http://127.0.0.1:8288` locally. Use the pinned CLI with persistence and loopback binding. Run the app on port 3001. The legacy `planning:worker` remains a direct-dispatch fallback using the same durable outbox; normally keep it stopped while using Inngest. Never start an old pre-F14 worker after migration.

For cloud deployment, remove INNGEST_DEV, configure INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY, register `/api/inngest`, and verify signatures/hosting timeouts. Inngest's SDK owns webhook signature validation; the route is not a user-session endpoint. Local unsigned mode must not be exposed publicly. Cloud keys were not requested or used for this feature.

`jobs:status` reports pending count, oldest pending age, total active queued jobs, overdue acknowledged-but-unclaimed jobs (unclaimedDelivered), and uncertain-job count without user content. An age over five minutes needs operator attention; no alert delivery integration is implemented. The persistent local broker and MongoDB must both be backed up for local restart recovery. Do not discard broker storage and assume already acknowledged events will automatically reappear.

Reference: [Inngest local development](https://www.inngest.com/docs/local-development), [Next.js integration](https://www.inngest.com/docs/getting-started/nextjs-quick-start).

## Verification

- 60 planning, scene, compilation, settings and durable-job regression tests passed against disposable replica sets. The final 14-job test suite additionally covers interrupted migration recovery, parent ETag invalidation and hourly retry quotas; all eight deletion tests passed.
- Real local broker delivery and duplicate delivery passed with one deterministic provider invocation: [broker report](F14-inngest-verification.json).
- Browser and final build/activation results are recorded in PROJECT_STATUS.md.

## Dependency review / production gate

The pinned SDK (4.26.2) and local CLI (1.49.0) passed integration testing. The final npm audit reports 24 entries: 20 moderate and four high (including propagated parent-package entries). The new runtime issue is Inngest's required Zod 3 dependency, flagged by [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). The CLI installer depends on adm-zip 0.5, also flagged for archive handling. The CLI is development-only and installs the official Inngest binary; the app does not use it to extract user uploads. A compatible follow-redirects test dependency fix was applied.

Do not treat this local milestone as production security approval. Resolve or formally mitigate the Zod advisory before public deployment, keep the unsigned local broker on loopback, and review the remaining CLI/tooling advisories. No forced incompatible downgrade or Zod-major override was applied merely to suppress audit output. Cloud signature checks, deployment body limits and production operational review remain release gates.