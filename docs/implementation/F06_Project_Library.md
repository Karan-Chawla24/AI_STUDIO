# F06 — Project library and dashboard

Implemented 2026-10-23. F06 builds on the F05 draft model; authentication remains Better Auth.

## Setup

Use Node 24 and the existing database/auth environment. From `studio/`, run `npm run library:migrate`, then `npm run library:verify`. Migration F06_0001_library_indexes adds four indexes to projects and includes prerequisites. It does not rewrite documents or alter the applied F05 schema/checksum. Migrations remain explicit, never run on application startup.

Optional server-only configuration:

- PROJECT_CURSOR_SECRET: at least 32 characters; when blank, use BETTER_AUTH_SECRET with a separate HMAC domain.
- PROJECT_CURSOR_PREVIOUS_SECRET: previous signing secret during rotation. Keep it available for 30 minutes after issuing the last old-key cursor, then remove it. When switching from the fallback, the previous key is the former BETTER_AUTH_SECRET.

Neither key is returned to the browser. Rotating without a previous key invalidates outstanding page links; the UI offers a list refresh.

## Read contracts

GET /api/v1/projects requires a session and an ACTIVE profile. It returns only the owner's ACTIVE projects, using the standard data/requestId envelope, private no-store caching and Vary: Cookie.

Query parameters: limit (integer 1–50, default 20), sort (updated_desc, created_desc, title_asc), q (trimmed NFC title prefix, 1–80 code points, lowercased), creationStatus, publicationStatus and cursor. Unknown/duplicate parameters and invalid enums are rejected. Search escapes regex metacharacters; it is literal prefix matching, not full-text search. Both status filters intersect.

The page contains items and {hasMore, nextCursor, limit}. Signed base64url cursors bind the owner, endpoint, normalized filters, sort, limit and first-page time. They expire 30 minutes after the first page; subsequent pages do not extend that expiry. Signature, binding or malformed input failures return INVALID_CURSOR (400); expiry returns CURSOR_EXPIRED (400). Authentication failures return 401, inactive profiles 403 and unavailable storage 503 with the existing sanitized error envelope.

Sorting uses the selected field plus _id as a deterministic tie-breaker. Subsequent pages exclude creations after the first-page time. This is live keyset pagination, not a database snapshot: edits can move records across page boundaries. The UI deduplicates appended IDs and refreshes from the beginning on focus/visibility restoration. Do not reuse a cursor after changing any query parameter.

Summaries expose ID, title, revisions, creation/publication status, stale flag, dates and allowedActions. F06 returns durationSeconds=null, thumbnailAvailable=false and OPEN only. Ideas, owner IDs and internal projection timestamps are omitted.

GET /api/v1/dashboard accepts no query parameters. It returns asOf, counts, up to five recent projects and upcomingSchedules. Counts and recents are separate owner-scoped reads and may briefly differ during concurrent changes. Current strict schemas support drafts only; render/job/schedule counts are zero and upcomingSchedules is empty. Future owning features must extend these projections when their persisted entities are introduced. No sample video totals are shown.

## Storage and performance

New partial indexes cover ACTIVE projects by owner + updatedAt/_id, owner + titleSort/_id, owner + creation status + updatedAt/_id, and owner + publication status + updatedAt/_id. Existing F05 createdAt index supports newest-first listing. Each database listing/aggregate has a five-second execution bound. Combined filters/search/sorts may require additional scanning or sorting; evaluate production query plans before adding more indexes. Reads do not require transactions or change project state.

## UI behavior

Projects has a 20-item initial page, explicit search submission, creation/publishing filters, three sorts, load-more, loading placeholders, first-project and filtered-empty states, retry and expired-cursor refresh. A new query aborts the previous request and ignores stale responses. Cards link to the existing saved draft. Home displays real project/draft totals, ready-video count and five recent projects. Detail pages link back to the library. Search state is local to the page and resets on navigation.

## Owner test

1. Sign in at http://localhost:3001 and open Projects.
2. Create two differently named drafts, return to Projects and confirm both appear.
3. Search using the beginning of a title, change the sort, and try status filters. Published should be empty until publishing exists.
4. Clear filters and open a draft; reload and confirm its saved details.
5. Open Home and check the saved-project and draft counts and recent cards.
6. Test on a narrow/mobile window. If you have more than 20 drafts, load the next page.

Automated evidence is recorded in PROJECT_STATUS.md and F06-browser-verification.json. Fixtures use isolated temporary databases, never the owner's Atlas database. F07 deletion, editing, generation and publishing remain separate milestones.
