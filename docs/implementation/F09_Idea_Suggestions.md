# F09 — AI idea suggestions and refinement

Implemented 2026-10-25 in `studio/`. Stop here for owner review before F10.

## Owner test

1. In `studio/.env.local`, set `GEMINI_API_KEY` and `GEMINI_MODEL` to an enabled model. They remain server-only and ignored by Git. No fallback model is silently selected.
2. Run `npm run ideas:migrate`, then `npm run ideas:verify` with Node 24. The F09 migration has already been applied to the configured Atlas database.
3. Run `npm run ideas:worker` in a separate terminal alongside the application. The queue is durable in MongoDB; an application restart does not lose accepted jobs. The worker requires process supervision on deployment.
4. Sign in, verify your email using the existing local email preview flow, and open a draft.
5. Save the plan, then select **Explore ideas** or **Refine this plan**. Optional guidance is limited to 1,000 characters; brainstorming supports 1–10 ideas.
6. Reload while queued/running. The request should reappear. Review the result and explicitly choose **Use this idea**, or dismiss the set. Acceptance changes the refined plan only; title/original idea remain intact.
7. Edit while a provider request runs or after a suggestion arrives. Old suggestions cannot overwrite a newer revision. They remain readable so useful text can be copied manually.
8. Cancel a queued request or a running request. Running cancellation waits for provider settlement and may still incur cost. Deleting a project fences late results and removes proposal/input content.

## Implemented boundaries

- Better Auth session and authoritative email-verification gate; owner/lifecycle checks on reads and commands; exact-origin/session-bound CSRF; bounded strict JSON; idempotency keys; generic sanitized errors; private cache headers.
- POST brainstorm/refine, GET proposal/job lists and details, POST apply/dismiss/cancel. Lists use signed 30-minute owner/project/filter/limit-bound keyset cursors. Detail reads support conditional ETags.
- Transactional owner fence, one active job/project, twenty planning admissions per rolling hour/owner, immutable input snapshot, acceptance receipt and atomic project/job state changes. Repeated same-key commands return the same receipt. Different payloads conflict. Active or uncertain receipts do not expire.
- Explicit suggestion acceptance uses both project revision and proposal version. A stale apply commits CONFLICTED before returning 409. Plan updates and redacted audit are atomic. Raw provider text never becomes database control fields; IDs are server generated.
- MongoDB-backed queue and one-shot provider journal. Worker claims and records SENT before sending outside the transaction. A 120-second provider deadline is shorter than the 180-second worker lease. Worker crashes/ambiguous responses become REQUIRES_ATTENTION and retain the project reservation; they are never automatically resent.
- Strict bounded output validation, no raw provider failures in public responses/logs, no provider secrets in client bundles. No Gemini tools, arbitrary URLs, narration, rendering or publishing in F09.
- Project deletion scrubs proposal payloads, job input and response receipt content. Hash-only provider journals remain for operational evidence; late workers cannot recreate deleted content.

## Deliberately deferred infrastructure

F09 uses the durable `generationJobs` collection directly as its polling queue and its partial unique active-project index as the reservation. Full outbox/inbox, generic reservation/usage collections, cross-provider orchestration, linked `/jobs/:id/retry`, retry budgets and operator settlement tooling remain F14. There is no retry action advertised for terminal jobs; after a known failure the user can explicitly submit a fresh planning command, subject to quota. Unknown outcomes cannot be cleared through the browser. An operator must review provider evidence before a future settlement tool can release the guard; project deletion remains available.

The implemented collection validators deliberately cover only F09 fields/states, as earlier feature migrations do. Future job/schema additions require new forward migrations. Historical jobs and proposals have no automatic expiry while the project exists. Account deletion and full retention policy remain F21/F24. General API read/mutation throttles remain operational hardening; the paid planning admission limit is enforced now.

No live Gemini call has been made for this feature: credentials/model are still blank in the application environment, and permission to reuse the POC settings is pending. Automated browser checks use an injected provider only in an isolated test runner, never a production mock.

## Verification

- Existing 63 regression tests passed with the F09 changes; 12 new integration tests cover migrations, strict validation, ownership/verification, replay/conflicts, concurrent workers, explicit acceptance, stale proposals, invalid/uncertain outcomes, cancellation/deletion, expired leases, signed pagination, HTTP guards, transaction rollback, hourly quota and edits during active work.
- Desktop, 390px and 320px Chrome checks cover verification gating, queue recovery after reload, review before acceptance, persistence, cancellation and layout. Screenshots and a JSON report accompany this document.
- TypeScript, lint, production build and final Atlas verification passed. The final affected regression run passed 49 tests; the suite contains 75 tests in total, including the 26 unaffected auth/email/database tests passed earlier. Local preview sign-in returned 200; anonymous project reads returned 401.
