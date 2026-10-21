# Project status — Educational Video Studio

Last updated: 2026-10-21

This is the source of truth for implementation progress. The PRD defines product scope; the API, database and system-design documents define the implementation contracts. Stitch boards are visual references, not proof that features work.

## Current milestone

**F01 and F02 complete.** Next: F03 authentication. Persistent development database configuration is still needed.

Build in `studio/`. Keep the existing `internet-poc/` as the reference video pipeline. Synced `sources/` files are read-only.

## Feature backlog

Complete and verify one small feature at a time. Update this file in the same change as the implementation. Only mark a feature complete after its acceptance checks pass.

| ID | Feature | Acceptance check | Status |
| --- | --- | --- | --- |
| F01 | Next.js/TypeScript scaffold, Mineral Signal tokens, responsive app shell | Install, typecheck, lint, production build and route smoke checks pass | Complete |
| F02 | MongoDB connection and migration/index tooling | Configuration validated; connection failures handled; bootstrap indexes verified against a test database; domain indexes follow owning features | Complete (local integration verified) |
| F03 | Better Auth email/password and sessions | Sign-up/sign-in/sign-out work; protected pages/APIs enforce session ownership | Planned |
| F04 | Email verification and password recovery | Expiring links, resend limits and generic recovery responses tested | Planned |
| F05 | Project creation and persistence | User can create/read a draft; foreign-owned IDs return 404 | Planned |
| F06 | Project library and dashboard | Search, cursor pagination, filters, empty/loading/error states use persisted data | Planned |
| F07 | Project deletion | Explicit confirmation; soft deletion and cleanup follow DB contract | Planned |
| F08 | Plan editor and autosave | Saved draft survives reload; conflicts preserve local edits | Planned |
| F09 | Idea suggestions and refinement | Validated AI proposals require explicit acceptance | Planned |
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

- Do not expose this scaffold as an authenticated production application.
- No secrets are copied from the POC. No external paid services are called.
- Voice rights, licensed music, Meta permissions and deployment region remain launch decisions.
- Next: configure a persistent Atlas/local replica-set database and implement F03 authentication. Only migration control schema/indexes exist so far; auth and product collections arrive with their features.
