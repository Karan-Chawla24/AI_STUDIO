# F08 — Plan editor and autosave

Implemented 2026-10-24. This milestone adds manual draft editing. AI suggestions, storyboards and generation remain separate features.

## Setup

Use Node 24 and the existing MongoDB/auth environment. From studio, run `npm run plan:migrate` and `npm run plan:verify`. The migration includes F07 prerequisites. Start the app on port 3001; run `npm run deletion:worker` alongside it once migrations pass.

Atlas activation is currently blocked by the database user's missing collMod permission on AI_Studio.idempotencyRecords (F07 prerequisite). F08 also requires collMod for projects and auditEvents. Correct migration permissions, then rerun the commands; no new application secrets are needed. Test fixtures always use a temporary replica set.

## Contract and storage

PATCH /api/v1/projects/:projectId accepts expectedRevision plus at least one of title, refinedIdea, audience or niche. Title is 1–120 Unicode code points, refinedIdea 1–5000, audience/niche 1–200 or explicit null to clear. Text is NFC-normalized and trimmed. Omitted fields remain unchanged; empty optional strings are invalid at the API (the UI sends null). Original idea, ownership, settings and status are not writable through this endpoint.

Missing revision returns 428 PRECONDITION_REQUIRED; malformed fields return 422; stale revision returns 409 REVISION_CONFLICT with error.details.currentRevision only after ownership is established. Missing, foreign and deleted projects return 404. Require session, exact origin and session-bound CSRF; active unverified users can edit. PATCH uses revision control, not an Idempotency-Key. Successful responses contain the full Project DTO. Visible changes advance the GET ETag through resourceVersion.

T03 touches the ACTIVE profile fence, checks the owner's ACTIVE project and revision, updates only changed fields, normalizes titleSort, increments revision/resourceVersion/publication epoch, and inserts a redacted audit in one transaction. Failure rolls back every write. No-op saves at the current revision leave project versions and audit history unchanged. Racing edits/deletion serialize on the shared profile/project writes; no silent last-write-wins behavior. Content is never copied into audit details, which contain field names and from/to revisions only.

F08_0001_plan_editor expands refinedIdea validation to nullable text and adds the plan-update audit event. No document backfill or new indexes are needed. The F05/F07 definitions and checksums stay unchanged; their verifiers accept the exact known forward-compatible shapes. The migration is forward-only and restartable. Delete cleanup now clears refinedIdea as well as the original draft and creation receipt content.

Current schemas only permit drafts. The editor refuses projects with a storyboard, running job or publication intent; future milestones must add the documented PLAN_CHANGED warning and state-dependent editing rules when those entities exist. F08 does not claim those future transitions are implemented.

## Browser behavior

Open a draft from Projects. Both /projects/:id and the documented /projects/:id/plan route open the editor. The editable plan begins with refinedIdea when present, otherwise the original idea. The original remains read-only alongside the form. Optional audience/niche can be cleared. The header displays saved, dirty, saving, checking or review-needed state and the saved revision.

Autosave debounces for 800 ms and sends only changed fields. One request runs at a time; typing during a save remains in the local buffer and gets a subsequent save. Save now uses the same sequence. Requests time out after 15 seconds. Normalized server text replaces only fields the user has not changed during that request.

On a revision conflict or uncertain write outcome, reread before another PATCH. If the saved plan matches the attempted version, acknowledge it without writing again. Otherwise keep local edits and show both versions. Use saved version explicitly confirms discarding local edits. Save my version uses the reviewed server revision; if it changed again, another conflict is shown. There is no automatic merge or forced bypass of revision checking. Network/session errors preserve fields and offer Check saved version; no automatic write storm on errors.

Local edits exist in the current tab's memory, not localStorage or sessionStorage. A reload after All changes saved retrieves persisted content. Reload/close and clicked links warn while dirty; history navigation/browser crashes are not a durable local-draft recovery mechanism. Copy important unsaved text before discarding or leaving an unresolved conflict. Delete is hidden while the editor is dirty or saving and receives the latest revision once saved.

## Owner checks after Atlas activation

1. Open or create a disposable draft. Edit its title, plan and audience; wait for All changes saved, then reload.
2. Clear audience/niche and confirm the empty optional values persist.
3. Open the same draft in two tabs. Save in one, then edit in the other. Confirm local text remains visible beside the latest saved version.
4. Choose Use saved version or Save my version and verify the deliberate result after reload.
5. Briefly disconnect while editing. Reconnect, choose Check saved version and review before saving.
6. Try the editor on a narrow screen. The original idea should still be readable beneath the form.

See PROJECT_STATUS.md and F08-browser-verification.json for actual validation results. Stop for owner testing before F09 AI suggestions/refinement.
