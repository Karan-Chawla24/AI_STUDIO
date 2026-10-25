# Project status — Educational Video Studio

Last updated: 2026-10-25

This is the source of truth for implementation progress. The PRD defines product scope; the API, database and system-design documents define the implementation contracts. Stitch boards are visual references, not proof that features work.

## Current milestone

**F09 — AI idea suggestions and refinement are implemented.** Atlas migration/verification passed. The application now supports background idea requests and explicit proposal review. Live Gemini testing is pending configuration: `studio/.env.local` has empty `GEMINI_API_KEY` / `GEMINI_MODEL` entries; permission to reuse POC settings was requested. Finish F09 owner testing before F10.

Build in `studio/`. Keep the existing `internet-poc/` as the reference video pipeline. Synced `sources/` files are read-only.

## Feature backlog

Complete and verify one small feature at a time. Update this file in the same change as the implementation. Only mark a feature complete after its acceptance checks pass.

| ID | Feature | Acceptance check | Status |
| --- | --- | --- | --- |
| F01 | Next.js/TypeScript scaffold, Mineral Signal tokens, responsive app shell | Install, typecheck, lint, production build and route smoke checks pass | Complete |
| F02 | MongoDB connection and migration/index tooling | Configuration validated; connection failures handled; bootstrap indexes verified against a test database; domain indexes follow owning features | Complete (local integration verified) |
| F03 | Better Auth email/password and sessions | Sign-up/sign-in/sign-out work; protected pages/APIs enforce session ownership | Complete; owner authorized progression |
| F04 | Email verification and password recovery | Expiring links, resend limits and generic recovery responses tested | Complete with local previews; owner authorized progression |
| F05 | Project creation and persistence | User can create/read a draft; foreign-owned IDs return 404 | Complete; owner authorized progression |
| F06 | Project library and dashboard | Search, cursor pagination, filters, empty/loading/error states use persisted data | Complete; owner authorized progression |
| F07 | Project deletion | Explicit confirmation; soft deletion and cleanup follow DB contract | Complete; owner authorized progression |
| F08 | Plan editor and autosave | Saved draft survives reload; conflicts preserve local edits | Complete; owner authorized progression |
| F09 | Idea suggestions and refinement | Validated AI proposals require explicit acceptance | Implemented; live Gemini configuration and owner testing pending |
| F10 | Storyboard generation | Async job produces validated 6–12-scene proposal; application is explicit | Planned |
| F11 | Scene editing and regeneration | Immutable revisions, conflicts and proposal comparison work | Planned |
| F12 | Compilation and storyboard approval | Approval waits for saves/compilation; relevant edits invalidate approval | Planned |
| F13 | Voice, captions and music settings | Two validated voices, required captions and optional licensed music | Planned |
| F14 | Durable job/outbox infrastructure | Idempotency, leases, retries, cancellation and reconciliation tested | Planned |
| F15 | Narration and timing | Per-scene audio, alignment and measured-duration repair work | Planned |
| F16 | Render worker and private media storage | Trusted templates produce validated 60–90s vertical MP4s; private media access enforced | Planned |
| F17 | Preview, downloads and render history | Current/stale versions distinguished; authorized downloads work | Planned |
| F18 | Instagram connection | OAuth state, reconnect and disconnect tested; tokens remain server-side | Planned |
| F19 | Publish now | Idempotency and unknown-outcome reconciliation prevent blind duplicate publishing | Planned |
| F20 | Scheduled publishing | Timezones, rescheduling, cancellation and recovery tested | Planned |
| F21 | Profile and account deletion | Settings persist; irreversible deletion follows documented state transitions | Planned |
| F22 | Public homepage and legal layouts | Approved design implemented; reviewed legal copy replaces placeholders | Planned |
| F23 | Accessibility, mobile and operational hardening | Keyboard/mobile checks, ownership/security tests and observability pass | Planned |
| F24 | Deployment and release | Environment, migrations, worker, backups and end-to-end acceptance verified | Planned |

## Change log

### 2026-10-25 — F09 idea proposals and refinement

- Owner authorized the next feature. Added Explore ideas and Refine this plan to the Mineral Signal plan editor, optional guidance/count, durable request status, reload recovery, cancellation, review cards, explicit acceptance/dismissal and paginated suggestion history. Acceptance changes refinedIdea only; original idea/title are preserved. Manual edits can continue during provider work; stale results cannot overwrite them.
- Added verified-email/owner/session/CSRF-protected commands, strict request/output validation, signed list cursors, conditional detail reads, idempotency and a transactional one-active-job/project guard. Twenty planning admissions per rolling hour/owner are enforced across projects. Project and dashboard projections reflect active work.
- Added F09_0001_idea_proposals migration, strict job/proposal/provider-journal collections and indexes. Prior migration checksums remain unchanged. Atlas migration and final verification passed. Project deletion purges planning content and fences delayed completions.
- Added server-only Gemini structured-output adapter and a durable MongoDB polling worker. No automatic provider retry/model fallback. Lost responses/expired running leases require operator review and hold the project guard. The broader F14 outbox/reservation/linked-retry/settlement infrastructure remains deferred; implemented boundaries are documented in docs/implementation/F09_Idea_Suggestions.md.
- Existing 63 regression tests passed alongside the initial F09 suite. F09 now has 12 integration tests, including transaction rollback, hourly quota and edits during active work. The final affected regression run passed all 49 tests (75 total tests across the suite, with unaffected auth/email/DB checks passing earlier). TypeScript, lint and the production build passed. Browser checks passed verification gating, queued reload, explicit acceptance/persistence, cancellation and desktop/390px/320px layout with zero page errors; provider responses were injected only in the isolated test runner.
- Added blank ignored Gemini settings and documented configuration. No live Gemini call or worker startup has occurred because the application key/model are empty. No owner drafts were edited by tests. Production preview is running at http://localhost:3001; sign-in returned 200 and anonymous project API access returned 401. The deletion worker was restarted; the idea worker awaits configuration. Stop before F10 for configuration and owner review.

### 2026-10-24 — Atlas activation for F07/F08

- Owner added dbAdmin scoped to AI_Studio while retaining the existing read/write role. Reran plan:migrate, which successfully applied the pending F07 prerequisite and F08 plan schema.
- plan:verify and deletion:verify both passed against Atlas. The previous collMod blocker is resolved; credentials and application code were unchanged.
- Started the local deletion cleanup worker after verification. The existing production preview on http://localhost:3001 responds successfully; sign-in returns 200 and unauthenticated project access returns 401.
- Prior 63 isolated regression tests and browser checks remain the feature evidence; no tests edited or deleted the owner's live drafts. This activation changed schemas/indexes and documentation only, so application tests/build were not repeated.
- Owner can now test create/edit/autosave/reload, two-tab conflict handling and confirmed deletion. Stop for owner review before F09. Local preview/worker require restarting after the computer or processes stop; production supervision remains F24.

### 2026-10-24 — F08 manual plan editor and autosave

- Owner requested the next feature despite the pending Atlas activation. Added the Mineral Signal plan editor at saved draft URLs and /projects/:id/plan, with editable title/refined idea/audience/niche and a read-only original-idea reference.
- Added 800 ms sequential autosave, visible save/review states, preservation of typing during in-flight saves, bounded network requests and uncertain-write reconciliation. Two-tab conflicts retain local text and show both versions for an explicit choice. Optional fields can be cleared. Dirty-page links/reload warn; local edits are in-memory, not a durable browser draft store.
- Added owner/session/CSRF-protected PATCH with required revision, strict validation, normalized title search, transactional profile/project fences, version increments and redacted audit. No-op changes do not advance revisions. Original idea/settings/state remain immutable through this route. Deletion cleanup now scrubs refinedIdea too.
- Added F08_0001_plan_editor validator expansion; prior migration checksums remain unchanged and known forward-compatible shapes are verified. No new provider integration, environment variables or indexes. Existing future storyboard/job states are not enabled by this milestone.
- All 63 isolated regression tests passed, including eight plan tests for revision races, ownership, transaction rollback, deletion races and API behavior. Browser checks passed autosave/reload, typing during a slow save, both conflict-resolution choices, optional-field clearing, lost-response reconciliation and offline recovery. Desktop and 390px/320px layouts checked with zero page errors. ESLint, TypeScript and the final production build passed.
- Atlas migration retry confirmed error 8000 AtlasError: configured user cannot collMod AI_Studio.idempotencyRecords. F08 activation is blocked on this F07 prerequisite; no live owner drafts were edited by tests. Correct migration permission, run plan:migrate and plan:verify, then start deletion:worker. See docs/implementation/F08_Plan_Editor.md for setup and owner checklist. Stop before F09.

### 2026-10-23 — F07 confirmed project deletion

- Owner authorized F07. Added deletion actions to library cards and saved details with a native confirmation dialog, safe initial focus, cancel/Escape, pending protection and same-key retry after a lost response.
- Added owner-scoped DELETE /api/v1/projects/:id and GET /api/v1/deletions/:id. Admission validates revision/confirmation, session CSRF and idempotency, then atomically fences the profile/project and writes a durable job, receipt and redacted audit. Accepted drafts disappear from ordinary reads/counts immediately.
- Cleanup transaction scrubs draft content and creation-receipt bodies, retaining minimal tombstones and retry protection. Added after-response cleanup plus a polling worker/recovery command; accepted jobs survive process interruption. Unsupported future resources fail closed. No live owner projects were deleted during testing.
- Added forward-only F07 schema/index migration with compatible F05 verification; immutable prior migration checksums remain unchanged. Terminal tombstones/jobs expire after 90 days; pending jobs do not expire. Setup, limitations and test checklist: docs/implementation/F07_Project_Deletion.md.
- All 55 isolated regression tests passed, including eight deletion tests for ownership, stale revisions, concurrent retries, rollback, redaction and recovery. ESLint and production build/TypeScript passed. Chrome desktop/390px/320px checks passed cancellation, safe focus, interrupted response retry, hidden project, completed cleanup and updated dashboard count; zero page errors. Screenshots/report are committed as evidence.
- Atlas activation is BLOCKED: error 8000 AtlasError, user is not allowed to run collMod on AI_Studio.idempotencyRecords. The migration was recorded FAILED and its lock released; the first validator change was rejected. Do not claim Atlas deletion is ready. Owner has been asked to update migration permissions. Rerun deletion:migrate and deletion:verify, start deletion:worker, then test before F08.

### 2026-10-23 — F06 project library and dashboard

- Owner authorized the next feature. Added owner-scoped project listing with literal title-prefix search, creation/publication filters, three stable sort orders and signed 30-minute cursor pagination. Cursors bind the owner and query, support previous-key rotation and exclude later creations.
- Added a real-data Home dashboard, recent-project cards, library loading/empty/error states, retry, expired-cursor recovery, request cancellation, appended-ID deduplication and focus refresh. Saved detail pages link back to Projects.
- Added F06_0001_library_indexes as an additive migration; existing F05 schemas and checksums remain unchanged. Atlas migration and index verification passed, preserving existing accounts/drafts. Optional cursor signing variables are documented in .env.example; no credentials changed.
- All 47 isolated regression tests passed. ESLint and production build/TypeScript passed. Chrome browser checks passed saved-draft listing, pagination, title search/sort, filters, network retry, expired-cursor refresh, dashboard counts and mobile widths 390/320 with no page errors. Screenshots and the browser report are in docs/implementation/.
- Current schemas still support drafts only. Video/job/schedule counts remain zero until their owning features exist; no fake media totals or thumbnails were introduced. Pagination is live, not a database snapshot. F07 deletion and all editing/generation remain planned.
- Production preview started at http://localhost:3001; sign-in returned 200 and unauthenticated library/dashboard APIs returned 401. Setup, cursor rotation and the owner test checklist are in docs/implementation/F06_Project_Library.md. Stop for owner testing before F07.

### 2026-10-23 — Review fix: account email timing

- Fixed the P2 account-enumeration issue: verification and reset callbacks now schedule delivery with Next.js `after()` instead of awaiting the sender before the public acknowledgement. Provider delay/timeouts no longer extend the response.
- Kept the generic responses, 600 ms local-processing floor, expiry, rate limits and verification marker ordering. Scheduled delivery failures are caught and log only a generic code.
- Added a regression for both endpoints with an unresolved sender, checking response completion and identical registered/unknown acknowledgements before delivery is released, then confirming eventual delivery.
- All 16 authentication/email tests passed, including the delayed-sender regression for both endpoints. ESLint, TypeScript and production build passed. No schema, credentials or feature scope changed; F05 remains awaiting owner review.

### 2026-10-22 — F05 owned draft creation

- Owner authorized the next feature. Added a Mineral Signal create-draft form and saved detail page with reload persistence, optional audience/niche and 60–90 second target duration.
- Implemented POST `/api/v1/projects`, owner-scoped GET `/api/v1/projects/:projectId`, conditional ETags and session-bound CSRF token issuance. Unverified active users can save drafts. Invalid/foreign/deleted projects return404.
- Added explicit migration for strict draft, terminal receipt and audit schemas/indexes. Creation atomically writes the profile fence, project, seven-day idempotency receipt and content-redacted audit. Added owner creation admission limit and recovery after uncertain commit acknowledgements.
- Added duplicate-key JSON rejection, bounded bodies, Unicode validation, safe API errors and unchanged-request retry retention. Browser testing deliberately dropped a successful save response and confirmed the retry opened the original draft without duplication.
- All 37 isolated tests passed (12 project tests plus 25 existing tests). TypeScript, lint and production build passed. Browser checks passed at desktop/390px/320px with no runtime/hydration errors; saved details and owner isolation verified.
- No provider integration, project listing, editor or generation added. Existing user accounts are preserved; automated fixtures only use temporary databases. F06 remains planned until owner testing.

### 2026-10-22 — F04 verification and password recovery

- Owner authorized the next feature and selected local email previews. Added verification requests/confirmation, a studio verification banner, forgot/reset password screens, resend cooldowns and explicit confirmation before link consumption.
- Added an EmailSender adapter, local ignored preview files and `email:preview` command. Resend transport is configurable but live delivery/domain setup remain untested. No real emails sent or external paid services called.
- Verification links expire in 60 minutes and use an adapter-stored fingerprint for single-use enforcement. Reset links expire in 15 minutes; native transactional reset revokes existing sessions. Fragments keep link tokens out of page requests; same-origin POSTs perform mutations.
- Updated the API contract for the confirmation POST bridge and fixed server-controlled link destinations. Existing F03 schema/indexes remain compatible; no new migration or dependency is required.
- All 25 isolated database/auth/email tests passed. Browser flow passed local delivery, verification, cooldown, password mismatch, reset, session revocation and new-password login. Desktop/390px/320px layouts inspected with zero runtime/hydration errors. Fixed same-page fragment navigation discovered in the first browser run.
- Final TypeScript, ESLint and production build passed. F05 remains planned; stop for owner testing.

### 2026-10-22 — Authentication handoff status

- F03 implementation was committed and pushed to `origin/dev` as `0c8fda5`; no additional application changes were pending at this handoff.
- Owner confirmed the Atlas connection string has been added. Local credentials remain ignored by Git; the successful Atlas connection and migration checks are recorded below.
- Owner sign-up/sign-in testing and approval are still pending. F04 remains planned.
- Documentation-only update: reviewed the status diff and Git whitespace checks; application tests were not rerun.

### 2026-10-22 — F03 authentication and owner review gate

- Owner requested testing before the next feature. Stop after F03 and wait for review before implementing F04.
- Implemented pinned Better Auth/MongoDB adapter 1.7.12, explicit auth/profile migration, sign-up/sign-in/sign-out UI, protected studio routes and owner-only `/api/v1/me`.
- Added session revocation/lifecycle checks, database rate limiting, exact-origin checks, request bounds and generic error messages. Email verification/password recovery remain F04; test accounts remain unverified.
- Generated local secret and added APP_ORIGIN to ignored `.env.local`; no secret is committed. Owner chose to supply an Atlas URI rather than use a local preview database.
- All 19 isolated authentication/database tests passed; the 10 database tests passed again after correcting validation to accept the owner's mixed-case database name. TypeScript, lint and final production build passed.
- Atlas connection, auth migration and schema/index verification passed. Automated account creation was tested only against isolated databases; the persistent database is ready for the owner to create a test account.
- Browser flow passed registration, incorrect password, sign-in, session reload, owner-profile API, sign-out and protected-page redirects. Desktop/mobile layouts checked at 1440px/390px/320px, with no runtime/hydration errors. Fixed the password field's accessible label during review.
- Next.js added its standard agent-guidance block during development. Local-only browser tooling is excluded under `.local/`.

### 2026-10-21 — Local environment template

- Created ignored `studio/.env.local` with all currently consumed application settings: blank `MONGODB_URI` for the owner to fill and `MONGODB_DB_NAME=educational_video_dev`.
- Provider/auth settings will be added when their features define and consume them. No credentials copied from the POC.
- Verified Git excludes the local environment file. Only this status update is committed; no application code changed or database connection attempted.

### 2026-10-21 — F02 database foundation

- Added pinned MongoDB driver, server-only connection pooling, explicit configuration checks, safe connection failures and snapshot/majority transactions.
- Added `db:check`, `db:status`, `db:migrate`, `db:verify` and isolated `test:db` commands.
- Added strict operational migration schema, checksums, single-writer lock, idempotent bootstrap and drift verification. Auth/domain collections and indexes are deferred to their owning features; this is the prelude to the DB design's M001, not a claim to implement all planned migrations.
- Added setup and recovery documentation in `docs/implementation/F02_Database_Foundation.md`; updated environment example and README.
- No UI changes or persistent database configuration. Local tests use a temporary MongoDB 8.2.6 replica set, never `.env.local` or Atlas credentials.
- Verification: all 10 database tests passed against MongoDB 8.2.6, including CLI commands, validation, locking, drift detection, rollback/commit and pool recovery. TypeScript, ESLint and production build passed with no database environment configured. Missing configuration exits with a sanitized error. Git whitespace check passed.

### 2026-10-21 — Development branch workflow

- Created `dev` from the initial scaffold commit on `main` for ongoing development.
- After each completed change: update this file, run relevant checks, commit and push to `origin/dev`.
- `main` holds reviewed milestones. Promote `dev` with a pull request after owner approval; no routine development pushes to `main`.
- Updated repository README and implementation instructions. Documentation-only change; application checks were not rerun. Verified branch setup and reviewed the documentation diff.
- This is a documented workflow; GitHub branch-protection rules have not been configured.

### 2026-10-21 — GitHub repository setup

- Repository: https://github.com/Karan-Chawla24/AI_STUDIO (public).
- Git root is this directory; application code is in `studio/`.
- Ongoing workflow authorized by the owner: update this file, verify each completed change, commit, and push to `origin`. Report failures rather than claiming synchronization.
- Initial source scope includes the application, status file and design/specification documents. Local POC experiments, synced sources, archives, raw Stitch results, dependencies, build output and secrets are excluded.
- No application behavior changed; F01 verification remains recorded below. Git commit/push evidence is the repository history rather than a self-referential commit hash in this file.

### 2026-10-20 — F01 completed

- Reviewed the PRD, architecture, API contract and approved design tokens.
- Chose a separate `studio/` application to keep POC experiments and generated media out of the product app.
- Scaffold pages are public local development previews. No authentication, persistence or provider integrations are claimed.
- API/DB contracts take precedence over generated UI copy, especially account deletion, per-scene voice settings and notifications.
- Added Next.js 16.4.2 / React 19.2 / strict TypeScript scaffold, ESLint and package lockfile.
- Added local Manrope and Bricolage Grotesque fonts, Mineral Signal colors, responsive shell and Home illustration.
- Added six route shells: Home, Create Video, Projects, Scheduled, Connections and Settings. Only navigation works; future feature pages explicitly identify themselves as placeholders.
- Added root redirect, 404 page, error boundary, keyboard skip link, focus styling and reduced-motion support.
- Added README, environment example with no secrets, ignore rules and `studio/AGENTS.md` requiring status updates with every future change.
- Corrected mobile illustration overlap found during screenshot review.
- Runtime: Node 24.19.0 used for final build; Node 20.10 installed globally is below supported tooling requirements. `.node-version` records the tested version.

## Verification

### F05 — 2026-10-22

- 37 tests passed, zero failed. TypeScript, ESLint and production build passed.
- Browser evidence: [report](docs/implementation/F05-browser-verification.json), [create desktop](docs/implementation/F05-create-desktop.png), [saved draft mobile](docs/implementation/F05-saved-mobile.png).
- [Migration, API/DB details, retry limits and owner checklist](docs/implementation/F05_Project_Creation.md).
- Atlas additive migration and schema/index verification passed. Production preview is running on localhost:3001; signed-out creation redirects to sign-in and project/CSRF APIs return401. No automated fixture accounts or drafts were inserted into Atlas. Owner review is pending; do not start F06.

### F04 — 2026-10-22

- Six email tests plus all 19 existing auth/database tests passed (25 total).
- Browser evidence: [report](docs/implementation/F04-browser-verification.json), [desktop verification](docs/implementation/F04-verify-desktop.png), [mobile reset](docs/implementation/F04-reset-mobile.png).
- [Setup, API/persistence details, limitations and owner checklist](docs/implementation/F04_Account_Email.md).
- TypeScript, ESLint and production build passed. Real email delivery is not verified. Owner subsequently authorized progression to F05.
- Existing Atlas auth schema/index verification passed without migration. The production preview on localhost:3001 serves all four account pages with HTTP 200 and the no-referrer header.

### F03 — 2026-10-22

- Nine auth integration tests + ten database tests passed; TypeScript, ESLint and build passed.
- Browser evidence: [test report](docs/implementation/F03-browser-verification.json), [desktop](docs/implementation/F03-sign-in-desktop.png), [mobile](docs/implementation/F03-sign-in-mobile.png).
- [Owner test checklist and scope](docs/implementation/F03_Authentication.md). Atlas migrations verified; email delivery is not implemented.
- Owner subsequently authorized progression to F04; its separate review gate is recorded above.

### F02 — 2026-10-21

- `test:db`: 10 passed, 0 failed; isolated real MongoDB replica set.
- TypeScript/ESLint: passed; production build: passed (all scaffold routes).
- CLI commands: check/status/migrate/verify tested end-to-end, including an idempotent rerun.
- No Atlas connection, real credentials, cloud roles or persistent database verified. No new UI behavior.
- [Setup, scope, migration and recovery details](docs/implementation/F02_Database_Foundation.md).

### F01 — 2026-10-20

Checked on 2026-10-20:

| Check | Result |
| --- | --- |
| Dependency install and lockfile | Passed |
| `npm run check` (route types, TypeScript, ESLint) | Passed, no lint warnings |
| Production build | Passed, including rebuild after mobile spacing fix |
| Six route responses and active navigation | Passed; HTTP 200 |
| Root redirect / missing page | `/` → `/home`; unknown route HTTP 404 |
| Keyboard skip link | First focus target; Enter focuses main content |
| Mobile widths 320px and 390px | No horizontal page overflow; creation/back navigation passed |
| Browser runtime exceptions | None during smoke checks |
| Desktop/mobile visual review | Completed; final screenshots saved |
| Production dependency audit | Zero reported advisories |
| Development dependency audit | Five high entries from one `braces` advisory propagated through the Next ESLint dependency chain; unresolved |

Evidence: [browser check report](docs/implementation/F01-verification.json), [desktop preview](docs/implementation/F01-desktop.png), [mobile preview](docs/implementation/F01-mobile.png).

The first sandboxed build hit Windows EPERM creating Next output folders. The final build succeeded with filesystem permission escalation. These checks are scaffold smoke checks, not full product/security/accessibility acceptance.

Development dependency follow-up: `braces` latest published version checked was 3.0.3, affected by [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). npm proposes downgrading the Next lint configuration to 14.x, which was not applied to this Next 16 scaffold. Recheck for a compatible fix before expanding tooling or release.

## Known limits and next step

- This is an early-access local test, not a production release; email delivery, role separation and deployment hardening remain outstanding.
- No secrets are copied from the POC. No external paid services are called.
- Voice rights, licensed music, Meta permissions and deployment region remain launch decisions.
- Next action: owner tests F05 by creating a draft and reopening its saved URL. After approval, implement F06 project library/dashboard. Real email delivery/domain verification and operational hardening remain release requirements.
