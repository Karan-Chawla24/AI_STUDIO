# F10 — Storyboard generation and review

Implemented 2026-10-26. Owner approved F09 and requested the next feature. Stop for owner testing before F11.

## Owner test

1. Open a saved project at http://localhost:3001 and ensure your email is verified.
2. Finish saving the plan. Scroll to **02 / Build the story** and select **Generate storyboard**. Creative direction is optional (up to 1,000 characters).
3. Reload while queued or running. Progress resumes from the persisted job. Cancellation uses the existing cooperative planning-job flow.
4. Review the title, hook and 6–12 scenes. Each scene shows narration, caption emphasis, supported visual type, visual direction, motion notes and an advisory duration estimate.
5. Select **Use this storyboard** or **Dismiss storyboard**. Generation alone never changes the current storyboard. Acceptance persists an immutable version and advances the project revision.
6. Edit the saved plan. The accepted storyboard stays available with a PLAN_CHANGED warning. Generate a replacement, confirm it, then explicitly accept the new proposal. Version history retains prior accepted snapshots.
7. Open an older accepted version from history. It is read-only. A proposal made against an older plan cannot be force-applied; generate again from the current plan.

## Runtime setup

- Existing ignored GEMINI_API_KEY and GEMINI_MODEL are reused. No new secrets or dependencies.
- Node 24: `npm run storyboard:migrate`, then `npm run storyboard:verify`.
- Run **one** `npm run planning:worker` alongside the web app and `npm run deletion:worker`. It processes both idea and storyboard jobs. Replace an older worker process when deploying; do not leave old code running through schema upgrades.
- The shared planning limit remains twenty admissions/hour/owner and one active job/project. The same receipt, ownership, CSRF, verified-email, cancellation, lease and uncertain-provider-outcome rules apply to both kinds.

## API and persistence

- POST `/api/v1/projects/:projectId/storyboards/generate`: expectedRevision, optional guidance and optional replaceExistingConfirmed. Existing storyboards require explicit replacement confirmation. Returns a durable 202 receipt.
- Existing proposal list/detail/apply/dismiss endpoints support STORYBOARD. Applying forbids selectedIdeaId and requires project revision plus proposal version. Stale application persists CONFLICTED and returns 409; no force-apply.
- GET storyboard list/detail routes are owner scoped. Lists have signed owner/project/limit-bound, 30-minute keyset cursors. Details support ETags. Historical reads do not change the current pointer.
- F10_0001_storyboards expands the implemented validators and adds immutable storyboard storage, unique project/version and source-proposal indexes, and owner/project history indexing. Prior migration definitions/checksums remain unchanged.
- Acceptance inserts the snapshot, updates the current pointer/counter, clears approval/hash, advances revision and publish fence, marks the proposal APPLIED and writes a redacted audit in one transaction. Failure rolls back all writes. A reused idempotency key returns the original receipt.
- Plan edits/idea acceptance retain existing scenes and add PLAN_CHANGED. A replacement clears that warning. Project deletion removes all accepted snapshots/proposals, scrubs job inputs and fences delayed provider completion.

## Validation and scope

Provider input is an immutable plan snapshot. The provider receives no database IDs or credentials as subject data. Structured output is revalidated: 6–12 scenes, supported scene types only, bounded nonempty narration/visual/motion fields, aggregate narration at most 12,000 characters, and highlights occurring in that scene's narration. Extra fields are rejected. Server code assigns IDs and contiguous order and calculates advisory timing.

Content hashing uses sorted object keys and excludes identity/time/version fields. Accepted snapshots start NEEDS_COMPILATION with no compiled preview, approval or render-ready hash. The initial `speech-pass-through-v1` normalizer only NFC-normalizes and collapses whitespace; full pronunciation mapping, layout compilation and approval remain F12. Estimated seconds use 150 words/minute and do not prove actual video duration. Narration/timing/render verification remain F15/F16. F11 adds editing/regeneration; no timeline editor, audio, publishing or fake video preview is included here.

F09's documented limits still apply: polling MongoDB queue, no generic outbox/inbox or linked retry/settlement tool yet. Those remain F14. Historical snapshots are retained until project deletion; full account/retention operations remain F21/F24. Validation is not factual certification; the owner reviews the educational content.

## Evidence

### Timeout fix — completed 2026-10-27

The browser stopped waiting after 15 seconds while repeated full database audits took 23.1 seconds before admission. Runtime planning commands now check the relevant APPLIED migration receipts and exact checksums on every request, without caching. Full validator/index drift verification remains in the explicit verification command and planning-worker startup; operators must run that verification after database schema maintenance. Migration definitions and checksums are unchanged.

An interrupted acknowledgement triggers at most one automatic replay with the same URL, serialized body, CSRF token and idempotency key. Explicit HTTP responses are not automatically retried. If both attempts fail, the UI refreshes persisted status, retains the original pending operation and offers a safe retry. This does not automatically resend Gemini provider calls or alter existing proposals.

The focused 26 tests passed again on October 27, including guards for migration-state/checksum changes and zero collection/index audits during admission/replay/apply/worker polling. The recorded browser test delayed a successful acknowledgement for 18 seconds; recovery completed with exactly one durable job, and desktop/390px/320px checks reported no page errors. See [diagnosis](F10-timeout-diagnosis.json) and [browser regression](F10-timeout-browser-verification.json). TypeScript, lint and the production build passed and updated preview/worker were activated; worker startup passed full Atlas verification. No paid generation was required for this fix. The original October 26 activation attempt was interrupted before build/restart and was completed on October 27.

### Original F10 milestone

- All 83 regression tests passed, including eight storyboard integration tests for migration compatibility, validation/hash identity, explicit acceptance/idempotency, replacement/history/ownership, stale plans, concurrent apply, rollback, cancellation/deletion and HTTP guards.
- Chrome desktop/390px/320px checks passed verification gating, queued reload, review before apply, accepted persistence, plan-change warning, confirmed replacement and history, with no page errors. See F10-browser-verification.json and the screenshots.
- One real Gemini 3.8 Flash request produced eight validated scenes in a PENDING proposal and a SUCCEEDED job, using an isolated temporary replica set. No owner drafts changed. See F10-live-verification.json.
- npm run check (TypeScript/lint), production build, Atlas migration and final verification passed. The production preview and both workers were restarted and reported ready; sign-in returned 200 and anonymous project reads returned 401.
