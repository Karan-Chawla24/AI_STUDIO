# AI Educational Video Generator — V1 API Design

**Version:** 1.0 · **Date:** 17 October 2026 · **Status:** Proposed implementation contract  
**Companions:** [Database design](AI_Educational_Video_Generator_V1_DB_Design.md), [System design](AI_Educational_Video_Generator_V1_System_Design.md).  
**Product source:** supplied `AI_Educational_Video_Generator_V1_PRD.md` v1.0, SHA-256 `68e914d2ecc3d32821cbbe60e654bea1d57570e566a75adc24777e3c0705e9ca`.

This specifies application APIs; it does not claim they exist. It elaborates the system design and records deliberate refinements in §2. The PRD remains authoritative for product scope. Limits marked proposed are reviewable engineering defaults. No paid resources or social publishing are activated. Google Stitch UI work follows review of these contracts.

## Contents

1. Scope and boundaries
2. Decisions resolving the architecture outline
3. HTTP, security and authentication
4. Validation, concurrency and idempotency
5. Pagination, filtering and polling
6. Response and error conventions
7. Shared resource DTOs
8. Account, catalogs and dashboard endpoints
9. Projects, ideas, storyboards and proposals
10. Generation, jobs, renders and media
11. Instagram connections and publishing
12. Scheduling
13. Internal workers, workflow events and webhooks
14. Limits, observability and compatibility
15. UI handoff and contract verification

## 1. Scope and boundaries

Base application path is `/api/v1`. Same-origin Next.js dashboard is its only V1 consumer. This is not a public API, SDK or customer API-key product. Every resource is single-owner; no organizations, teams, workspaces, subscriptions or credit balances. Better Auth owns `/api/auth/*`. Internal routes use independent service authentication, not browser cookies.

Workflow: Plan → Storyboard → Generate → Publish. Both Indian voice options, mandatory captions, versioned 60–90-second vertical outputs, download and Instagram publish/schedule are supported. API clients cannot submit React, shell commands, provider model names, raw voice IDs, arbitrary media URLs, ownership fields or state transitions.

Authentication API, application DTO and provider API are separate contracts. Do not forward provider responses or persistence documents directly to clients. Background work returns IDs/status links immediately; neither browser connectivity nor a live session keeps a job alive.

## 2. Decisions resolving the architecture outline

| ID | Binding detail for these documents | Effect |
|---|---|---|
| D01 | `expectedRevision` in JSON for project commands; `expectedVersion` for other mutable resources | Avoid conflicting If-Match/body precedence. ETags are only for conditional GET. |
| D02 | Persist immutable storyboard revisions; expose no arbitrary scene insert/delete/reorder endpoint in initial V1 | PRD editing/regeneration is covered without adding a timeline editor. |
| D03 | Manual edits save immediately, then require an explicit asynchronous compile command | Autosave never silently invokes expensive generation or claims uncompiled visuals are ready. UI can initiate compilation after Save at a deliberate boundary. |
| D04 | AI suggestions always become proposals; user accepts replacements | Fresh generated storyboard can be presented as a proposal and applied with one Continue action. Approval is still a separate step. |
| D05 | `Project.revision` tracks editorial edits; `resourceVersion` tracks any visible change | Job progress cannot cause autosave conflicts. |
| D06 | One active project production/planning job; one active VIDEO_GENERATE per user | Edits remain possible during jobs; a second provider job waits or returns conflict. Social operations use their own locks. |
| D07 | Successful artifacts are immutable; retry creates a new job linked to the old one | Failure history remains auditable; unchanged artifacts are reused. |
| D08 | One reserved Instagram account per owner, including expired/reconnect states | Prevent multiple “current” account records and destination ambiguity. |
| D09 | Schedule edits use a fresh schedule version, never mutate an executing publish intent | Old deliveries cannot publish replacement content accidentally. |
| D10 | Project/connection publish fences and unresolved external outcomes are durable | Lease expiry is not permission to send another publish. |
| D11 | Store operational admission reservations, OAuth attempts and media references explicitly | DB design adds these supporting collections to the architecture outline. |

All schema/status names below and in the DB document must be shared constants in implementation. Cross-reference transaction identifiers `T01`–`T18` in the DB document.

## 3. HTTP, security and authentication

### 3.1 Transport and request pipeline

HTTPS only outside localhost. Accept `application/json; charset=utf-8`; reject unsupported media types with 415 and bodies over 256 KiB with 413 before parsing. No application binary uploads in V1. Strict JSON parsers reject duplicate object keys. Reject unknown request fields; never spread request bodies into database queries. Ignore no undocumented parameters silently.

Pipeline: request ID → size/content type → session/service identity → active-account check → CSRF/origin for mutations → rate limit → request schema → owner-scoped lookup → idempotency receipt lookup → revision/state checks → database transaction → sanitized response. Fail validation before any provider call. On replay, authenticate and check resource access before returning the stored receipt, but do not rerun obsolete revision preconditions for the already-accepted command.

Generate `X-Request-Id` server-side; accept a validated correlation ID only as separate diagnostic metadata. JSON dates are RFC3339 UTC strings with milliseconds. IDs are canonical UUID strings for domain resources; users are opaque Better Auth string IDs. Examples use artificial valid UUIDv7 IDs. Do not derive chronology or ownership from an ID. Counts and revisions are nonnegative safe integers; duration is seconds or explicitly suffixed `*Ms`, `*Samples`, `*Frames`.

Authenticated responses use `Cache-Control: private, no-store` except explicit conditional GET behavior in §5. Set `Vary: Cookie` where applicable. No authenticated resource enters a shared CDN cache. Never include tokens/URL signatures in analytics, exception reports or Referer links. All endpoints can return 500 INTERNAL_ERROR with a request ID, not a stack trace.

### 3.2 Browser identity

Use Better Auth email/password and MongoDB adapter. Cookie is HttpOnly, Secure in production, SameSite=Lax, host-scoped with path `/`; exact cookie name is adapter-configured and the frontend does not read it. Proposed expiry: seven days, with supported refresh behavior and server-side revocation. A cached client session is not authority for an API mutation.

All `/api/v1` operations require session except none of the catalog endpoints are public by default. Verified email is required for AI generation, approval, social connection and publication; unverified users may read/save drafts and request verification. Deleted/deleting accounts cannot start work. Logout does not cancel accepted jobs. Re-login restores status from persistence.

For cookie-authenticated unsafe methods verify exact allowed Origin, Fetch Metadata where present, and CSRF token/header using a server-issued session-bound mechanism. SameSite is defense in depth. Missing Origin on browser mutations is rejected unless a specifically authenticated internal route permits it. Browser CORS is same-origin; no wildcard credentials. OAuth callback uses single-use state instead of normal CSRF flow.

Every resource query is owner-scoped, including nested scene/render/proposal/connection references. Return 404 RESOURCE_NOT_FOUND for absent, deleted or foreign-owned resources, avoiding existence leaks. The owner is taken only from session. Browser DTOs never expose raw provider identifiers, access tokens, R2 keys, model prompts or worker internals.

### 3.3 Better Auth boundary

The pinned Better Auth SDK/native handler owns endpoint schemas, error envelopes and cookies. Do not wrap native auth responses in the application envelope or implement a second password system. The following describes required integration behavior; generate/contract-test actual SDK types after pinning the release. [Better Auth email/password](https://better-auth.com/docs/authentication/email-password), [MongoDB adapter](https://better-auth.com/docs/adapters/mongo)

| Native route under `/api/auth` | Request intent | Required application behavior |
|---|---|---|
| `POST /sign-up/email` | name, email, password; fixed allowed callback URL | Create identity; idempotently provision profile through supported hook. Generic duplicate-registration UX; never expose hash. |
| `POST /sign-in/email` | email, password, optional rememberMe | Set session cookie; generic invalid-credentials message; rate limit. |
| `POST /sign-out` | Native empty payload | Revoke current session; clear cookie; accepted jobs continue. |
| `GET /get-session` | Cookie | Native session/user projection or unauthenticated result; use `/me` for application profile. |
| `POST /request-password-reset` | email; destination fixed server-side | Same acknowledgement whether account exists; dispatch transactional email. |
| `POST /reset-password` | token, newPassword | Enforce expiry/single-use; revoke sessions as configured and require login. |
| `POST /send-verification-email` | email; destination fixed server-side | Throttle/resend cooldown; generic acknowledgement. |
| `POST /verify-email` | signed native token in JSON body | F04 application bridge invokes the native GET handler internally after explicit user confirmation; public GET is blocked. |

F04 refinement (2026-10-22): email links use fixed app pages with fragment tokens, removed from the address bar after loading. They require explicit confirmation so link scanners cannot mutate accounts. Verification adds an adapter-owned single-use fingerprint record around the native JWT check. Local preview delivery is enabled for owner testing; real delivery and durable email retry remain release follow-ups. See [F04 contract and limitations](implementation/F04_Account_Email.md).

Proposed password policy: 12–128 characters, no silent trimming, no logging, support Unicode and password managers. Normalize email through the auth library, not by inventing Gmail-specific rules. Password reset/verification email is required; general job emails remain out of scope. Recent authentication (within ten minutes) is required for account deletion; use supported reauthentication/session facilities. No user-facing admin role or role escalation endpoint exists in V1.

## 4. Validation, concurrency and idempotency

### 4.1 Text and domain limits

Unicode NFC for user-facing text, trim outer whitespace except passwords, count Unicode code points for documented text limits and UTF-8 bytes for body limits. Do not apply HTML interpretation. URLs in narration are plain text and never fetched. Empty optional values use explicit null where supported; PATCH omission means unchanged, null means clear only on nullable fields. Empty PATCH objects fail 422.

| Field | Proposed validation |
|---|---|
| Display name / project title | Display name 1–100; project and storyboard titles 1–120 |
| Idea | 1–5,000; blank rejected |
| Audience/niche | Optional, each 1–200 |
| Regeneration guidance | 0–2,000 |
| Scene narration / speech override | 1–1,200 per scene; total narration ≤12,000 |
| Scene visual/motion descriptions | 1–2,000 each |
| Scenes | Hard technical bound 2–16; recommend 6–12 and 5–12 seconds/scene |
| Target duration | Number 60–90; planning default 75 |
| Voice | INDIAN_MALE or INDIAN_FEMALE, currently available |
| Captions | CLEAN/BOLD/HIGHLIGHTED only when catalog-enabled; mandatory |
| Music | null or enabled catalog asset ID; no arbitrary file URL |
| Social caption | 0–2,200 characters as app cap; also enforce current provider validator and publish capability |
| Timezone | IANA identifier supported by pinned timezone library; not arbitrary UTC offset alone |
| Search query | 1–80; literal title-prefix search, not regex input |

Provider-specific caption/hashtag/media limits remain versioned server policy, verified before launch. The 2,200 cap is an application default, not a claim that every future Meta API uses it. Malformed data is 400, valid JSON violating business schema is 422. Unsupported content gets CONTENT_NOT_ALLOWED with a safe explanation.

### 4.2 Revisions

`expectedRevision` is required on project edits, idea selection, storyboard apply/compile/approval, generation and publication. Missing → 428 PRECONDITION_REQUIRED; stale → 409 REVISION_CONFLICT with currentRevision for owned resources. `expectedVersion` similarly guards schedules/profiles/connections/proposal dismissal. Use project revision even when editing one scene; no silent merge/last-write-wins.

Autosave debounce 700 ms, serialize saves, keep unsaved text on 409. Flush saves and compilation before approval. Metadata-only title rename increments editorial revision but does not invalidate render content hash. Rendered content/settings changes invalidate approval/current render and related schedules. Plan-only idea changes preserve the existing rendered content, add PLAN_CHANGED, and require an explicit storyboard replacement to change the video. Project names are library metadata; storyboard title is rendered content and changes via storyboard title edit/compile.

### 4.3 Idempotency and command receipts

Require `Idempotency-Key` on POST commands and destructive DELETE; recommended UUIDv4/v7, 16–128 printable ASCII characters. Scope is owner + method + canonical route including resource ID + key. Hash canonical validated JSON (including revision/confirmation fields) plus action, excluding trace headers. Never use a key as authorization.

Same key/hash → original successful status and resource receipt with `Idempotent-Replay: true`; return current requestId. Different hash → 409 IDEMPOTENCY_CONFLICT. In-flight duplicate → 409 REQUEST_IN_PROGRESS and Retry-After. Validation failures before acceptance create no receipt. Atomic DB command success and receipt commit together, with unique-index race recovery. After a lost transaction acknowledgement, read receipt on primary before deciding the command failed.

Receipts expire after seven days only when the linked action is safely terminal; active/uncertain actions retain them. Independent durable business uniqueness (active job, publish intent, schedule intent) survives receipt expiry. Mutation responses contain no signed URLs/passwords/tokens. `/renders/:id/access` and OAuth start are deliberate exceptions: they mint fresh expiring grants and do not persist sensitive replay bodies. PATCH uses revision control rather than receipt: after an uncertain save, reread before sending a new revision.

Client network retry rules: GET may retry with backoff; accepted commands may retry with the **same** key/body; changing payload requires a new key. No automatic retry for 401/403/409/422. A 503 before acceptance may retry with the same key after Retry-After. Accepted background failure is read through the job DTO, not a later HTTP failure on the old request.

## 5. Pagination, filtering and polling

All large lists use forward keyset pagination: `limit` default 20, 1–50; `cursor` opaque signed base64url token, max 2 KiB. No offset/page numbers. Return `page:{nextCursor:string|null,hasMore:boolean,limit:number}`; fetch `limit+1` to determine hasMore. No expensive total count by default. An exhausted list has items `[]`, hasMore false and nextCursor null. A bounded filtered scan may return no matching items with hasMore true and a cursor after the last scanned row; the UI continues rather than declaring the library empty.

| List | Sort/filter contract |
|---|---|
| Projects | `sort=updated_desc` default; alternatives `created_desc`, `title_asc`. Filters `creationStatus`, `publicationStatus`, `q` title-prefix. |
| Proposals | createdAt DESC, id DESC; optional state/kind |
| Renders and jobs | createdAt DESC, id DESC; project is path-scoped; optional state, and kind for jobs only |
| Schedules | `due_asc` default or `created_desc`; filter state, UTC from inclusive/to exclusive, projectId |
| Publish attempts | createdAt DESC, id DESC; project is path-scoped; optional state |

Cursor binds version, owner digest, endpoint, normalized filters/sort, last sort tuple, expiry (30 minutes), and first-page `asOf` time. Forged/wrong-filter/wrong-owner cursor → 400 INVALID_CURSOR without revealing identity; expired → 400 CURSOR_EXPIRED. Check current authorization on every page. Domain IDs are compared lexically only as stable tie-breakers. User text is escaped for literal prefix queries; no user Mongo operators.

Consistency is **live keyset**, not a point-in-time snapshot. `asOf` excludes newly created records but edits to mutable sort fields can move rows across pages, causing omissions or repeats. Client deduplicates IDs and refreshes first page on focus/mutation; use created_desc for stable creation-order browsing. Do not falsely claim `asOf` freezes updates. Immutable render/job histories are more stable. Sign cursors with a rotating HMAC key; allow previous key until token expiry.

For active jobs poll every three seconds, hidden tabs 15 seconds with jitter, stop at terminal. GET resources may emit ETag derived from `resourceVersion`; `If-None-Match` returns 304/no body after ownership check. Retain `private, no-cache` on these conditional GET routes to allow private revalidation; other authenticated responses stay no-store. List ETags are optional; no mutation uses GET. In response `pollAfterMs` may slow clients under load.

## 6. Response and error conventions

Successful object: `{data:T,requestId:string}`. List: `{data:{items:T[],page:Page},requestId}`. Async accepted: HTTP202, `Location` status route, `Retry-After:3`, `data:{operationId,jobId?,renderId?,state,statusUrl,pollAfterMs:3000}`. `operationId` is the relevant job/attempt/schedule identifier; generic operation storage is not implied. Complete cache hit may return 200 with `state:SUCCEEDED`, renderId and `reused:true`, no new job.

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "This project changed in another session. Your edits have not been applied.",
    "retryable": false,
    "fieldErrors": [],
    "details": {"currentRevision": 13},
    "action": "RELOAD_AND_COMPARE"
  },
  "requestId": "req_example"
}
```

`fieldErrors` uses `{path:"/scenes/0/narration",code:"REQUIRED",message:"Add narration."}` with JSON Pointer paths. `details` is a code-specific allowlisted object, not arbitrary exception data. `action` enum: RETRY_LATER, SIGN_IN, VERIFY_EMAIL, RELOAD_AND_COMPARE, EDIT_STORYBOARD, COMPILE_STORYBOARD, APPROVE_STORYBOARD, REGENERATE_VIDEO, RECONNECT_INSTAGRAM, REVIEW_PUBLISH_STATUS, CONTACT_SUPPORT, NONE.

| HTTP | Codes / frontend behavior |
|---|---|
| 400 | MALFORMED_JSON, INVALID_CURSOR, CURSOR_EXPIRED, INVALID_QUERY: fix request/restart list |
| 401 | AUTH_REQUIRED, SESSION_EXPIRED: preserve local work, sign in |
| 403 | EMAIL_NOT_VERIFIED, CSRF_FAILED, ACCOUNT_DELETING: no automatic retry |
| 404 | RESOURCE_NOT_FOUND: remove inaccessible card or show not found |
| 409 | REVISION_CONFLICT, VERSION_CONFLICT, APPROVAL_REQUIRED, STATE_CONFLICT, ACTIVE_JOB_EXISTS, IDEMPOTENCY_CONFLICT, REQUEST_IN_PROGRESS, PROPOSAL_STALE, RENDER_STALE, PUBLISH_IN_PROGRESS, PUBLISH_OUTCOME_UNKNOWN, DUPLICATE_SCHEDULE, CONNECTION_ALREADY_BOUND |
| 413/415 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE |
| 422 | VALIDATION_FAILED, CONTENT_NOT_ALLOWED, STORYBOARD_INVALID, DURATION_OUT_OF_RANGE, VOICE_UNAVAILABLE, INVALID_LOCAL_TIME, AMBIGUOUS_LOCAL_TIME, SCHEDULE_OUT_OF_RANGE, CAPTION_INVALID |
| 428 | PRECONDITION_REQUIRED |
| 429 | RATE_LIMITED, DAILY_LIMIT_REACHED: Retry-After or resetAt where appropriate |
| 500 | INTERNAL_ERROR: safe message/request ID |
| 503 | SERVICE_UNAVAILABLE, PROVIDER_UNAVAILABLE: accepted work stays saved; no vendor billing detail |

Job `error` has the same code/message/action shape plus stage and failedSceneIds; detailed provider error is private. Provider 402 is an operator billing fault, not HTTP402 asking a V1 user to purchase credits. Include Retry-After seconds on 429/temporary503, never a fake retry guarantee. Explicit user retries are only advertised in `allowedActions` when legal.

## 7. Shared resource DTOs

Notation: fields are required unless `?`; `T|null` is explicitly nullable. Arrays are bounded. JSON transport excludes `_id`, ownerId, objectKey, credentials, leases and raw provider responses. Stable domain ID is exposed as `id`. Datetimes are strings; hashes are 64 lowercase hex digits.

| DTO | Fields |
|---|---|
| Profile | id, displayName, email, emailVerified, timezone, defaultVoiceKey, version, createdAt |
| ProjectSummary | id, title, revision, resourceVersion, creationStatus, publicationStatus, stale, durationSeconds:null/number, thumbnailAvailable:boolean, createdAt, updatedAt, allowedActions:string[] |
| Project | ProjectSummary + originalIdea, refinedIdea:null/string, audience:null/string, niche:null/string, activeStoryboardId:null/ID, storyboardVersion:null/int, settings:Settings, currentSnapshotHash:null/hash, approval:null/Approval, activeJob:null/JobSummary, latestRender:null/RenderSummary, warnings:Warning[] |
| Settings | voiceKey:null/VoiceKey, captionStyle:CLEAN/BOLD/HIGHLIGHTED, musicAssetId:null/ID, targetDurationSeconds:number; resolved provider versions are server-only |
| Approval | storyboardId, snapshotHash, approvedAt; applies only when hash matches current content |
| Warning | code, message, sceneId:null/ID, severity:INFO/WARNING/ERROR |
| Storyboard | id, projectId, version, baseRevision, title, hook, targetDurationSeconds, visualStyle:minimal_editorial, compileState:NEEDS_COMPILATION/VALID/INVALID, contentHash, scenes:Scene[], warnings, createdAt |
| Scene | sceneId, order, narration, speechText, speechMode:AUTO/OVERRIDE, visualDescription, motionDescription, sceneType, estimatedDurationSeconds, captionHighlights:string[], compiledPreview:null/PreviewConfig, validationErrors:FieldError[] |
| Proposal | id, projectId, kind:IDEAS/STORYBOARD/SCENE/DURATION_REPAIR/SOCIAL_CAPTION, baseRevision, targetSceneId:null/ID, state:PENDING/APPLIED/DISMISSED/CONFLICTED, version, payload:typed union, createdAt |
| JobSummary | id, kind, state, stage, completedUnits, totalUnits, pollAfterMs, allowedActions |
| Job | JobSummary + projectId, baseRevision, snapshotHash:null/hash, renderId:null/ID, proposalIds:ID[], startedAt:null/date, finishedAt:null/date, error:null/SafeError, warnings, cancelRequested:boolean, retryOfJobId:null/ID |
| RenderSummary | id, state, storyboardId, snapshotHash, stale:boolean, durationSeconds:null/number, createdAt |
| Render | RenderSummary + width:1080, height:1920, fps:30, frameCount:null/int, alignmentQuality:null/WORD/PHRASE/ESTIMATED, verificationStatus:PENDING/PASSED/FAILED, captionsAvailable, thumbnailAvailable, allowedActions |
| Connection | id, provider:INSTAGRAM, username, accountType, status:CONNECTING/CONNECTED/EXPIRED/REAUTH_REQUIRED/FAILED/DISCONNECTED, version, expiresAt:null/date, capabilities:{publishReels:boolean}, lastError:null/SafeError |
| PublishAttempt | id, projectId, renderId, connectionId, intentId, scheduleId:null/ID, state, permalink:null/httpsURL, submittedAt:null/date, publishedAt:null/date, error:null/SafeError, allowedActions |
| Schedule | id, projectId, renderId, connectionId, caption, dueAtUtc, timezone, localDateTime, offsetMinutes, version, state, publishAttemptId:null/ID, attentionReason:null/string, createdAt, allowedActions |

Proposal payload unions: IDEAS `{ideas:[{id,title,refinedIdea,rationale}]}` (1–10); STORYBOARD/DURATION_REPAIR `{storyboard:Storyboard}`; SCENE `{scene:Scene}`; SOCIAL_CAPTION `{caption:string,renderId:ID}`. Server payload includes content only, never tokens. Compile does not constitute factual certification. PreviewConfig contains only sanitized renderer-supported data; exact typed template union is defined in DB §4 and is read-only to clients.

AllowedActions are UI hints, recalculated server-side, not authorization tokens. Dashboard counters are separate read models; creation and publishing states are independent. Previously published media can coexist with a current draft/stale render.

## 8. Account, catalogs and dashboard endpoints

Tables specify all allowed request fields. Fields are required unless marked `?`; omitted PATCH fields remain unchanged, explicit null is allowed only where stated. Path IDs never appear again as writable ownership fields. Every endpoint inherits §3–6, including errors, ownership, limits and response envelopes. `R` means expectedRevision, `V` means expectedVersion; these abbreviations expand to those exact JSON field names. `Async` means the §6 202 receipt, not a completed result. All command POSTs and DELETEs require Idempotency-Key except explicitly stated exceptions.

| Method and path | Request | Success and rules | DB operation |
|---|---|---|---|
| GET `/me` | None | 200 Profile; includes preferences, not credentials | Owner lookup |
| PATCH `/me` | V, displayName?:1–100 chars, timezone?:IANA zone, defaultVoiceKey?:catalog key/null | 200 Profile; preference changes do not alter existing projects | T01 |
| GET `/security/csrf` | None | 200 `{token,expiresAt}`; session-bound, no-store; mint token through supported security integration | Session |
| DELETE `/me` | V, confirmation:`DELETE_MY_ACCOUNT` | 202 `{deletionId,state:ACCEPTED}`; recent authentication required; revoke sessions; no subsequent browser polling promised | T18 |
| GET `/catalogs` | None | 200 `{catalogVersion,voices,captionStyles,music,sceneTypes,limits}`; logical keys, labels, availability and disabledReason only | Versioned release config |
| POST `/voices/:voiceKey/preview-access` | Empty object; no Idempotency-Key | 200 AccessGrant to a curated, pre-generated licensed sample; no arbitrary TTS text | T14 |
| GET `/dashboard` | None | 200 `{asOf,counts,recentProjects,upcomingSchedules}`; recent/upcoming at most 5 each | Owner aggregates |

Dashboard counts: `projectsTotal,drafts,needsReview,readyVideos,activeJobs,scheduledPosts,attentionItems`. A project can count in several categories. Counts exclude deleted entities; `readyVideos` means projects with a READY current render. These are informative and can lag up to 30 seconds; authorization/admission never relies on counters. Catalog voices are exactly two enabled logical choices, `INDIAN_MALE` and `INDIAN_FEMALE`, subject to launch validation; unavailable choices remain visible with a reason. Music entries include license attribution, duration and sample availability. No default provider voice substitutes silently.

## 9. Projects, ideas, storyboards and proposals

### 9.1 Project and editor routes

| Method and path | Request | Success and special rules | DB operation |
|---|---|---|---|
| POST `/projects` | title, originalIdea, audience?:string, niche?:string, targetDurationSeconds?:60–90 (default75) | 201 Project; Location header; other settings derive from versioned defaults/profile | T02 |
| GET `/projects` | limit?,cursor?,sort?,q?,creationStatus?,publicationStatus? | 200 page of ProjectSummary; §5 filters; one exact value per status filter | Read |
| GET `/projects/:projectId` | None | 200 Project or 304; current references and allowed actions | Read |
| PATCH `/projects/:projectId` | R, title?:string, refinedIdea?:string, audience?:string/null, niche?:string/null | 200 Project; at least one editable field. Changing plan leaves storyboard intact but adds PLAN_CHANGED warning | T03 |
| PATCH `/projects/:projectId/settings` | R, voiceKey?:key, captionStyle?:key, musicAssetId?:ID/null, targetDurationSeconds?:60–90 | 200 Project; content-affecting change clears approval and stales render. Captions cannot be disabled | T03 |
| DELETE `/projects/:projectId` | R, confirmation:`DELETE_PROJECT` | 202 `{deletionId,state:ACCEPTED}`; immediate visibility/command fence; async cleanup | T18 |
| GET `/deletions/:deletionId` | None | 200 `{id,scope:PROJECT,state:ACCEPTED/CLEANING/WAITING_EXTERNAL/COMPLETED/REQUIRES_ATTENTION,updatedAt}`; retained owner receipt independent of deleted project | Read |
| GET `/projects/:projectId/storyboards` | limit?,cursor? | 200 page of Storyboard summaries: id,version,title,compileState,createdAt | Read |
| GET `/projects/:projectId/storyboards/:storyboardId` | None | 200 immutable Storyboard; historical revisions readable | Read |
| PATCH `/projects/:projectId/storyboard` | R, title?:1–120, hook?:1–500 | 200 `{project,storyboard}`; edits rendered title/hook, creates snapshot | T03 |
| PATCH `/projects/:projectId/scenes/:sceneId` | R, narration?:string, speechMode?:AUTO/OVERRIDE, speechText?:string, visualDescription?:string, motionDescription?:string, sceneType?:catalog key, captionHighlights?:string[] | 200 `{project,storyboard}`; immutable replacement snapshot; stable sceneId | T03 |
| POST `/projects/:projectId/storyboards/compile` | R | Async STORYBOARD_COMPILE job; no-op valid current compile returns 200 `{state:SUCCEEDED,storyboardId,reused:true}` | T04/T05 |
| POST `/projects/:projectId/approval` | R, storyboardId, snapshotHash | 200 Project; VALID compile, required settings and no blocking warnings; records exact approval | T06 |
| DELETE `/projects/:projectId/approval` | R | 200 Project; remove approval; active job not silently cancelled | T06 |

Scene editing rules: AUTO derives speechText deterministically using the versioned pronunciation normalizer; reject supplied speechText in AUTO. OVERRIDE requires nonblank speechText on entry and retains it on unrelated edits; changing narration while overriding requires explicit speechText or switching to AUTO, preventing stale narration/audio. Highlight strings: maximum 12, each 1–60 characters, must match normalized displayed narration. `estimatedDurationSeconds` and compiled layout/timing are server-controlled. Every actual content edit changes revision, copies the full small storyboard snapshot and clears approval; exact canonical no-op returns existing revision. A new snapshot has NEEDS_COMPILATION for changed visual/speech fields; unchanged compiled scenes may be reused. Changing title also recompiles its affected title scene. Scene IDs not in current snapshot return 404, even if present historically.

Compile lowers supported scene descriptions into bounded templates; it may use the planner provider and therefore requires an explicit command, verified email and admission. On completion it can install a compiled snapshot only if the original project revision is unchanged. Otherwise expose a CONFLICTED proposal, never overwrite edits. Invalid compile stores validation feedback; UI remains editable. Approval never promises factual accuracy.

### 9.2 AI commands and proposal acceptance

| Method and path | Request | Success and rules | DB operation |
|---|---|---|---|
| POST `/projects/:projectId/ideas/brainstorm` | R, count?:1–10(default5), guidance?:string | Async IDEA_BRAINSTORM; proposal of alternatives, no project overwrite | T04/T05 |
| POST `/projects/:projectId/ideas/refine` | R, guidance?:string | Async IDEA_REFINE; IDEAS proposal with one refined idea | T04/T05 |
| POST `/projects/:projectId/storyboards/generate` | R, guidance?:string, replaceExistingConfirmed?:boolean(defaultfalse) | Async STORYBOARD_GENERATE; if storyboard exists require true; old storyboard retained pending apply | T04/T05 |
| POST `/projects/:projectId/scenes/:sceneId/regenerate` | R, scope:NARRATION/VISUALS/BOTH, guidance?:string | Async SCENE_REGENERATE; immutable proposal, other scenes unaffected | T04/T05 |
| GET `/projects/:projectId/proposals` | limit?,cursor?,state?,kind? | 200 page of Proposal | Read |
| GET `/projects/:projectId/proposals/:proposalId` | None | 200 Proposal; owner-only content | Read |
| POST `/projects/:projectId/proposals/:proposalId/apply` | R, V, selectedIdeaId?:ID | 200 `{project,storyboard:null/Storyboard,proposal}`; idea selection required for IDEAS, forbidden otherwise | T05 |
| POST `/projects/:projectId/proposals/:proposalId/dismiss` | V | 200 Proposal; PENDING/CONFLICTED only | T05 |

Apply requires proposal.baseRevision == current revision == R, proposal PENDING, and matching proposal version. A stale proposal returns 409 PROPOSAL_STALE with currentRevision; mark CONFLICTED. There is no force-apply or silent merge. User can copy useful text into the editor or regenerate from current content. Applying social caption updates the project caption draft bound to renderId; it does not alter video approval/hash. Applying an idea changes refinedIdea, leaves existing storyboard intact with PLAN_CHANGED warning. Applying a storyboard/scene/duration proposal installs a new snapshot and clears approval. Dismiss never deletes audit history.

## 10. Generation, jobs, renders and media

| Method and path | Request | Success and rules | DB operation |
|---|---|---|---|
| POST `/projects/:projectId/generations` | R, storyboardId, snapshotHash | Async VIDEO_GENERATE with renderId; exact approved current snapshot only; 200 cached READY render if same full render fingerprint | T07 |
| GET `/projects/:projectId/jobs` | limit?,cursor?,state?,kind? | 200 page of JobSummary | Read |
| GET `/projects/:projectId/jobs/:jobId` | None | 200 Job or 304 | Read |
| POST `/projects/:projectId/jobs/:jobId/cancel` | V (job.resourceVersion) | 202 receipt referencing same job; terminal job returns 200 current Job; cancellation cooperative | T08 |
| POST `/projects/:projectId/jobs/:jobId/retry` | R, V (job.resourceVersion) | Async new linked job; only FAILED/CANCELLED safe-to-retry jobs and unchanged original input; changed input requires fresh command | T04 or T07 |
| GET `/projects/:projectId/renders` | limit?,cursor?,state? | 200 page of RenderSummary | Read |
| GET `/projects/:projectId/renders/:renderId` | None | 200 Render or 304 | Read |
| POST `/projects/:projectId/renders/:renderId/access` | purpose:PREVIEW/DOWNLOAD/THUMBNAIL/CAPTIONS; no Idempotency-Key | 200 AccessGrant; READY verified artifact, owner scoped; historical stale downloads allowed with stale:true | T14 |
| PATCH `/projects/:projectId/social-caption` | R, renderId, text:0–2200 | 200 Project; saves editable caption draft bound to owned READY render; existing schedule captions unchanged | T03 |
| POST `/projects/:projectId/social-caption/generate` | R, renderId, guidance?:string | Async SOCIAL_CAPTION; current READY render; user review before publication | T04/T05 |

Add `resourceVersion` to full Job, Render and deletion DTOs for conditional reads and versioned commands; schedule/connection/proposal use their `version`. Social caption draft projection on Project is `{text,renderId,updatedAt}` or null. A successful generation does not automatically publish. Retry rechecks email, quota and provider availability; it does not blindly replay a failed HTTP request.

AccessGrant: `{url,expiresAt,method:GET,contentType,filename,stale}`. Proposed TTL: 15 minutes. Preview supports byte ranges through signed storage delivery; downloads set attachment disposition. CAPTIONS returns UTF-8 WebVTT; no arbitrary object key lookup. A missing optional thumbnail/caption returns 409 ARTIFACT_NOT_AVAILABLE. Signed URL issuance cannot revoke an already issued URL immediately; account/project deletion blocks new grants and asynchronously removes objects. Apply no-referrer when navigating to storage. Server-side publishing uses a separate bounded ingestion grant, never a preview URL copied from the client.

### 10.1 Job and generation behavior

Job state enum: QUEUED, RUNNING, CANCEL_REQUESTED, SUCCEEDED, FAILED, CANCELLED, SUPERSEDED, REQUIRES_ATTENTION. Job kind enum: IDEA_BRAINSTORM, IDEA_REFINE, STORYBOARD_GENERATE, SCENE_REGENERATE, STORYBOARD_COMPILE, SOCIAL_CAPTION, VIDEO_GENERATE. `stage` is one of QUEUED, PLANNING, COMPILING, PREPARING_AUDIO, ALIGNING, COMPOSING, RENDERING, VERIFYING, UPLOADING, FINALIZING, FINISHED. Progress is counted work units, not an invented exact percentage/ETA. `totalUnits` can be null until plan known; completedUnits never exceeds a known total.

Render states: PENDING, PREPARING, RENDERING, VERIFYING, READY, FAILED, CANCELLED. READY requires verified private MP4, duration 60–90 seconds inclusive, audio track, 1080×1920, 30fps, captions and manifest. Actual duration measured from decoded audio/frame plan replaces estimates. A duration repair creates a DURATION_REPAIR proposal and job REQUIRES_ATTENTION with action EDIT_STORYBOARD/APPROVE_STORYBOARD as appropriate. It must be applied and approved before a new generation. Never silently alter approved narration.

Edits during a generation are allowed. Worker may finish its original immutable input and expose the result as stale, but cannot make it the current render or publish it. Cancelling after an external paid call begins may not avoid its cost. A successful provider result arriving after cancel can be retained as a reusable private artifact, without reviving the cancelled job. Unknown external outcomes release ordinary admission only after reconciliation or an operator explicitly settles the risk; browser retry is disabled meanwhile.

### 10.2 Example: accept generation and poll

```http
POST /api/v1/projects/00000000-0000-7000-8000-000000000001/generations
Content-Type: application/json
Idempotency-Key: generation-20261017-0001
X-CSRF-Token: <session-bound token>
```

```json
{
  "expectedRevision": 8,
  "storyboardId": "00000000-0000-7000-8000-000000000002",
  "snapshotHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

```json
{
  "data": {
    "operationId": "00000000-0000-7000-8000-000000000003",
    "jobId": "00000000-0000-7000-8000-000000000003",
    "renderId": "00000000-0000-7000-8000-000000000004",
    "state": "QUEUED",
    "statusUrl": "/api/v1/projects/00000000-0000-7000-8000-000000000001/jobs/00000000-0000-7000-8000-000000000003",
    "pollAfterMs": 3000
  },
  "requestId": "req_example_01"
}
```

Response status is 202, with Location equal to statusUrl and Retry-After:3. The hashes/IDs above are illustrative, not accepted resources. Repeating the key and identical body returns the same acceptance, even if the job is now finished; polling returns current state.

## 11. Instagram connections and publishing

### 11.1 Connection lifecycle

| Method and path | Request | Success and rules | DB operation |
|---|---|---|---|
| GET `/connections/instagram` | None | 200 `{connection:null/Connection}`; one reserved destination | Read |
| POST `/connections/instagram/oauth-start` | returnPath?:allowlisted relative path; no Idempotency-Key | 200 `{authorizationUrl,expiresAt}`; single-use attempt; verified user | T09 |
| GET `/integrations/instagram/callback` | provider code/state or provider error | 303 fixed app location with opaque outcome ID; no provider tokens or raw error in URL | T09 |
| POST `/connections/:connectionId/reconnect` | V, returnPath?; no Idempotency-Key | 200 `{authorizationUrl,expiresAt}`; binds expected existing account identity | T09 |
| DELETE `/connections/:connectionId` | V | 200 Connection DISCONNECTED; cancel future schedules and fence new sends; external outcome may still need reconciliation | T09/T18 |
| POST `/connections/:connectionId/refresh` | V | 202 `{operationId,state:QUEUED,statusUrl}` pointing to connection GET; service attempts supported refresh/revalidation | T09 |

OAuth state is random, session/owner-bound and expires after ten minutes (proposed). Store only its hash; consume once. Callback can redeem while login cookie is unavailable only using the previously bound valid attempt, with no ability to change owner; final dashboard still requires login. Encrypted token exchange data is never stored in the idempotency response. Verify returned account eligibility and permissions server-side. If reconnect returns a different account, reject ACCOUNT_MISMATCH; user must disconnect and explicitly connect a replacement. App-level CSRF is waived only for verified OAuth callback state.

Provider permissions, Graph API version, account eligibility, token refresh and media limits are version-pinned adapter contracts verified against Meta before launch. This document does not assert a particular token type or permission string works for every login flow. Unsupported personal account returns 422 INSTAGRAM_ACCOUNT_UNSUPPORTED with a safe explanation. Capability failure returns 409 CONNECTION_NOT_READY.

### 11.2 Publish now and reconciliation

| Method and path | Request | Success and rules | DB operation |
|---|---|---|---|
| POST `/projects/:projectId/publish-attempts` | R, renderId, connectionId, caption, intentId:UUID, republishOfAttemptId?:ID | Async `{operationId,attemptId,state:QUEUED,statusUrl}` | T11 |
| GET `/projects/:projectId/publish-attempts` | limit?,cursor?,state? | 200 page of PublishAttempt | Read |
| GET `/projects/:projectId/publish-attempts/:attemptId` | None | 200 PublishAttempt or 304; includes resourceVersion | Read |
| POST `/projects/:projectId/publish-attempts/:attemptId/reconcile` | V | 202 receipt for same attempt; lookup/status-only, never another publish submission | T13 |
| POST `/projects/:projectId/publish-attempts/:attemptId/retry` | R,V | 202 new attempt under same intentId; definite FAILED and safe-to-retry only, original inputs still current | T11 |
| POST `/projects/:projectId/publish-attempts/:attemptId/cancel` | V | 200/202 current attempt; cancellation accepted only before SUBMITTING; otherwise409 PUBLISH_ALREADY_SUBMITTED | T13 |

Admission requires current READY non-stale render, matching current approval, connected eligible account, verified email, valid caption, no deletion fence, no active/unknown publish for either project or connection. Record caption/render/account as immutable intent inputs. New intent for an already published project/render/account returns 409 ALREADY_PUBLISHED unless `republishOfAttemptId` identifies the previous successful attempt, making intentional duplication explicit. A matching active schedule returns409 SCHEDULE_CONFLICT; cancel it before publish-now. Persist publish intent before calling Meta.

Attempt states: QUEUED → PREPARING → PROCESSING → READY_TO_SUBMIT → SUBMITTING → PUBLISHED. Safe preparation failures become FAILED; ambiguous submission becomes OUTCOME_UNKNOWN. OUTCOME_UNKNOWN allows reconciliation only. Missing HTTP response after submitting is not proof of failure. Return UI action REVIEW_PUBLISH_STATUS, hold durable fence, check provider identifiers/status. A worker timeout, retry key, reconnect, lease expiry or refreshed browser cannot bypass this fence. Already visible external posts are never deleted by project deletion/disconnect.

If an edit happens before the final SUBMITTING transaction, stop as FAILED with RENDER_STALE. If edit/cancel/delete races after submission was durably authorized, provider publication may already occur: record the result and show it against the immutable version. This is an explicit boundary, not a promise that a network request can be recalled.

## 12. Scheduling

| Method and path | Request | Success and rules | DB operation |
|---|---|---|---|
| POST `/projects/:projectId/schedules` | R, renderId,connectionId,caption,intentId,localDateTime,timezone,offsetMinutes,republishOfAttemptId?:ID | 201 Schedule; server computes dueAtUtc | T10 |
| GET `/schedules` | limit?,cursor?,sort?:due_asc/created_desc,state?,projectId?,from?:UTC date inclusive,to?:UTC date exclusive | 200 page Schedule; owner only; default due_asc | Read |
| GET `/schedules/:scheduleId` | None | 200 Schedule/304 | Read |
| PATCH `/schedules/:scheduleId` | V,R,renderId?,caption?,localDateTime?,timezone?,offsetMinutes? | 200 Schedule; future SCHEDULED/REQUIRES_ATTENTION only; time trio all-or-none; rechecks approval/connection | T10 |
| POST `/schedules/:scheduleId/cancel` | V | 200 Schedule; SCHEDULED/REQUIRES_ATTENTION → CANCELLED; executing returns409 SCHEDULE_EXECUTING | T10 |

`localDateTime` is exactly `YYYY-MM-DDTHH:mm:ss`, without zone; timezone is IANA, offsetMinutes is minutes east of UTC. Example: `2026-10-18T18:30:00`, `Asia/Kolkata`, `330` resolves to `2026-10-18T13:00:00.000Z`. Server rejects nonexistent DST wall time, and requires an offset that selects a valid occurrence for ambiguous time; never rely on browser's implicit timezone. Minimum lead two minutes, maximum horizon90days (proposed), evaluated against server time on create/edit. Return computed UTC and normalized wall time for confirmation. Store timezone database version and original local intent; do not silently move existing schedules after tzdata upgrades.

Allowed states: SCHEDULED, DISPATCHING, PUBLISHING, PUBLISHED, FAILED, REQUIRES_ATTENTION, CANCELLED. A minute scheduler claims due records with version checks and transactional outbox, not an in-memory timer. Dispatch grace is15minutes: overdue beyond grace becomes REQUIRES_ATTENTION; never post hours later without an explicit reschedule. Final submit rechecks all fences. Editing video/settings invalidates SCHEDULED records to REQUIRES_ATTENTION with CONTENT_CHANGED. Editing metadata-only project title does not invalidate. Updating a schedule increments version, invalidating old event deliveries. Only SCHEDULED and eligible current version may dispatch.

While another publish uses the connection, wait within grace, then require attention. Expired/revoked token causes REQUIRES_ATTENTION and reconnect guidance; reconnect never silently posts a missed schedule. Schedule edits cannot change the connected account: cancel and recreate for a new destination. A repeated same render/account schedule is rejected by an active semantic guard, even with a different idempotency key; intentional repost after a successful publication must identify that previous attempt.

## 13. Internal workers, workflow events and webhooks

Internal APIs are not browser features and do not use session cookies. Restrict transport to trusted services with signed service identity, expected issuer/audience and least-privilege service accounts. Verify timestamps/replay windows where using request signatures. Reject arbitrary bucket/object URLs and unrecognized worker builds. Routes below are proposed application-owned adapter paths; vendor webhook handler behavior follows its pinned SDK.

| Interface | Contract | Authorization and replay rule |
|---|---|---|
| `/api/inngest` vendor handler | Only methods required by pinned SDK; minimal event `{eventId,type,aggregateId,aggregateVersion}` | Verify Inngest signatures with SDK; production signing keys; DB event/step dedup |
| POST `/internal/v1/worker/claim` | `{jobId,stage,dispatchId}` → `{executionId,leaseEpoch,leaseExpiresAt,manifestGrant}` | Workload identity bound to dispatched job; T08; no arbitrary owner lookup |
| POST `/internal/v1/worker/heartbeat` | `{executionId,leaseEpoch,completedUnits}` → current lease | Epoch/state CAS; stale returns409 LEASE_LOST; bounded monotonic progress |
| POST `/internal/v1/worker/complete` | `{executionId,leaseEpoch,outputManifestKey,sha256}` → accepted receipt | Allowed job-owned key prefix and manifest size<=256KiB; verify checksum/artifacts before READY; T08/T14 |
| POST `/internal/v1/worker/fail` | `{executionId,leaseEpoch,errorCode,retryable}` → accepted receipt | Safe allowlisted error code; no raw credentials/provider bodies |
| POST `/internal/v1/outbox/drain` | `{batchSize?:1–100}` → counts | Service-only; recoverable leases; no public scheduler token in query string |
| POST `/internal/v1/schedules/dispatch` | `{batchSize?:1–100}` → counts | Service-only; due time from DB; T12 |
| POST `/integrations/instagram/webhook` | Raw provider body, signature headers | Adapter-verified signature before parse; dedup provider event; enqueue, acknowledge promptly |
| GET `/integrations/instagram/webhook` | Provider verification challenge | Exact configured verification flow; no account/session mutation |

The Meta webhook/deauthorization/data-deletion adapter must implement the chosen product's documented verification format; do not assume every callback uses the same header. User deletion callbacks are verified, owner-linked and routed to T18; return only the provider-required confirmation format and opaque tracking identifier. Native third-party callback envelopes are exceptions to application envelopes. Never accept user-supplied callback URLs.

Event names: `job.requested.v1`, `job.cancel-requested.v1`, `connection.refresh-requested.v1`, `schedule.dispatch-requested.v1`, `publish.requested.v1`, `publish.reconcile-requested.v1`, `deletion.requested.v1`. Envelope includes eventId,aggregateType,aggregateId,aggregateVersion,occurredAt,schemaVersion:1; owner/content are fetched from authorized DB records. Outbox acceptance and resource mutation are atomic. Delivery is at least once; workers must deduplicate business effects even if event IDs change. Provider calls stay outside transactions. Callback acknowledgements do not mean provider submission is safe to repeat.

## 14. Limits, observability and compatibility

Proposed initial limits, server-enforced and returned in catalogs: five new video attempts per owner per UTC day; twenty planning commands/hour; 120 authenticated reads/minute/session and 30 mutations/minute/owner; one active project job, one active video/user, two global render slots. Retry of unchanged input shares its original daily video reservation; it cannot reset an unlimited provider retry allowance. Provider attempts are capped at initial+two approved retries per step, subject to unknown-outcome and permanent-error rules. Failed-before-provider admissions release usage reservation; paid failed work counts. Account-wide provider budgets may stop new work with503 PROVIDER_UNAVAILABLE.

429 includes Retry-After and safe `{limitName,resetAt}`; concurrency conflict is409 ACTIVE_JOB_EXISTS with owned activeJobId. Internal cost/usage is not user-visible credit billing. Rate-limit bypass through new sessions is prevented by owner/IP buckets; avoid storing raw IP longer than needed. Limits are configuration defaults to benchmark, not PRD pricing promises.

Logs correlate requestId,owner pseudonym,project/job/render/attempt/event IDs and adapter version. Redact authorization headers,cookies,OAuth codes,signed URLs,prompts/user content by default. Preserve structured failure codes and timing. Metrics include queue age,p95 acceptance/status latency,step failure rate,provider cost,duration rejection,stale completions,unknown publish count and outbox lag. Alert on unknown publish, repeated callback signature failure, cleanup backlog and leaked reservations. Never put an entire provider exception in a public error.

Within `/v1`, additive optional response fields are allowed; removing/renaming fields, changing meaning or narrowing accepted input is breaking. Unknown response enum must render a safe unavailable state; client must not infer permission from an unfamiliar value. Request fields remain strict. Breaking changes require `/v2` or coordinated migration. Pin SDKs, template/model catalogs and provider versions separately from HTTP version. Generate TypeScript validators and client types from one implementation contract; CI compares routes/DTOs against this design. The document is not an OpenAPI executable contract; create OpenAPI3.1 from those validated schemas during implementation.

### 14.1 Domain errors supplementing §6

| Code | HTTP | UI action/recovery |
|---|---|---|
| EMAIL_NOT_VERIFIED | 403 | VERIFY_EMAIL |
| RECENT_AUTH_REQUIRED | 403 | SIGN_IN |
| REVISION_CONFLICT / VERSION_CONFLICT / PROPOSAL_STALE | 409 | RELOAD_AND_COMPARE; retain unsaved input |
| IDEMPOTENCY_CONFLICT / REQUEST_IN_PROGRESS | 409 | Reused with changed payload: fix client; in-progress: bounded retry same key |
| ACTIVE_JOB_EXISTS / CONNECTION_BUSY / SCHEDULE_CONFLICT | 409 | Show current owned operation; do not start duplicate |
| STORYBOARD_NOT_COMPILED / STORYBOARD_INVALID | 409 / 422 | COMPILE_STORYBOARD / EDIT_STORYBOARD |
| APPROVAL_REQUIRED / RENDER_STALE | 409 | APPROVE_STORYBOARD / REGENERATE_VIDEO |
| DURATION_OUT_OF_RANGE | 422 in preflight or async job error | Review duration repair; do not publish invalid output |
| ARTIFACT_NOT_AVAILABLE / CONNECTION_NOT_READY | 409 | Wait, recover or reconnect |
| INSTAGRAM_ACCOUNT_UNSUPPORTED / INVALID_SCHEDULE_TIME | 422 | Correct account/time; fieldErrors identify inputs |
| ACCOUNT_MISMATCH / ALREADY_PUBLISHED | 409 | Explicit account replacement / intentional repost confirmation |
| PUBLISH_OUTCOME_UNKNOWN / PUBLISH_ALREADY_SUBMITTED / SCHEDULE_EXECUTING | 409 | REVIEW_PUBLISH_STATUS; do not repeat send |
| UNSAFE_RETRY | 409 | Reconcile original operation |
| RATE_LIMITED / DAILY_LIMIT_REACHED | 429 | RETRY_LATER at resetAt |
| PROVIDER_UNAVAILABLE | 503 | RETRY_LATER; no user billing instruction |

Async errors live on Job/Attempt.error using the same SafeError fields without HTTP status meaning; transport GET can be200 while job FAILED. `retryable:true` only means the advertised retry action is permitted, never raw provider request replay.

## 15. UI handoff and contract verification

| UI surface | Data/commands | Required non-happy states |
|---|---|---|
| Auth/onboarding | Better Auth + /me + catalogs | Verification, reset, session expiry, unavailable voice |
| Dashboard/library | /dashboard,/projects | Empty, loading, filters, live pagination refresh, deletion |
| Plan | Project edits + ideas commands/proposals | Pending AI, quota, proposal stale, saved vs unsaved |
| Storyboard | Snapshot/scenes,compile,approval | Compiling, invalid visual, speech override, conflict, explicit full replacement |
| Generate | Settings, generation receipt, job polling | Audio failure, duration repair, cancel pending, retry disabled, stale result |
| Preview | Renders, grants, caption proposal | Expired URL refresh, missing artifact, stale historical render |
| Publish | Connection OAuth,attempts | Ineligible account, reconnect, preparation, submitted, unknown, confirmed permalink |
| Schedule | Schedule create/list/edit/cancel | DST error, missed grace, content changed, executing/noncancelable |
| Settings/account | /me,connection,delete | Recent auth, deletion pending, external-post persistence |

Before implementation sign-off, execute contract tests for: every route's unauthenticated/foreign-owner cases; CSRF and cookie policy; request-size/unknown-field rejection; all documented nullability; stale R/V; same/different idempotency payload; two tabs saving; job refresh/logout; pagination tie-breakers/cursor tampering; generation cache and invalidation; actual duration rejection; signed URL isolation; same-account concurrent publishes; timeout-after-provider-success; duplicate outbox/callback; schedule DST/late dispatch/version race; deletion during render and publication. See DB §10 for race and transaction assertions.

PRD coverage: auth/security11,78–79,91; dashboard/editor12–23,51–56,70–75,83–85; audio/visual/render24–50; social/scheduling58–69; recovery/deletion/logging80–89,92–93; end-to-end94–102. UI design should use these DTOs, actions and failure states, with no provider implementation details exposed to creators. Google Stitch work is the next separate deliverable after review.

### 15.1 Additional request and response checks

Creation/publication filter values are the DB §6.4 enums. For schedule range queries, from must precede to; reject malformed or offset-free date-time strings. Missing optional filters means all owned values. JobSummary includes resourceVersion for cancellation/retry; RenderSummary includes resourceVersion for conditional reads. Successful DELETE project requires the explicit confirmation value above, mirroring the PRD confirmation dialog.

SafeError is `{code,message,retryable,fieldErrors,details,action}`; job-specific error extends it with `stage` and `failedSceneIds:ID[]`. Warning is `{code,message,sceneId:null/ID,severity:INFO/WARNING/BLOCKING}`. No blocking warning may be bypassed by client request flags. Compile must reject unsafe content/attempted prompt injection with CONTENT_NOT_ALLOWED and preserve the editable draft; model output remains untrusted data.

Catalog response entry shapes: voices `{key,label,description,available,disabledReason:null/string,previewAvailable}`; captionStyles `{key,label,available}`; music `{id,label,attribution,durationSeconds,available}`; sceneTypes `{key,label,available}`. Limits expose only creator-relevant bounds from §4/14, not credentials or infrastructure capacities. Catalog samples and user media grants share AccessGrant shape. `allowedActions` is an array of stable command names (`EDIT`,`COMPILE`,`APPROVE`,`GENERATE`,`CANCEL`,`RETRY`,`DOWNLOAD`,`PUBLISH`,`SCHEDULE`,`RECONCILE`,`RECONNECT`,`DELETE`), emitted only when the corresponding operation is currently permitted; empty means view-only. Additional project attention guidance comes from warnings/errors, never an unlisted implicit state change.

For brainstorm without a specific idea, create a project with the nonblank broad topic as originalIdea and a temporary user-editable title; no synthetic paid generation occurs on project creation. Refine/brainstorm then proposes specific ideas. Full replacement confirmation is required before generation when any storyboard exists, which is stricter than the PRD minimum for manually edited scenes.

An empty exhausted project list returns HTTP200:

```json
{
  "data": {
    "items": [],
    "page": {"nextCursor": null, "hasMore": false, "limit": 20}
  },
  "requestId": "req_example_list"
}
```

Example manual caption save body for `PATCH /projects/:projectId/social-caption`:

```json
{
  "expectedRevision": 12,
  "renderId": "00000000-0000-7000-8000-000000000004",
  "text": "What actually happens when you open a website? Here is the journey in 75 seconds."
}
```

Success is HTTP200 `{data:Project,requestId}` with revision13 if changed. A conflicting save is409 REVISION_CONFLICT and performs no write. Publishing still uses the caption explicitly submitted in its command; it never reads a mutable draft after acceptance.
