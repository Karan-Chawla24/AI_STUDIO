# F11 — Scene editing and regeneration

Implemented October 27–28, 2026, following the owner's instruction to proceed after F10. Stop for owner testing before F12.

## Owner test

1. Open a project with an accepted storyboard at http://localhost:3001. In **Current storyboard**, choose **Edit title and hook**, or choose a scene and select **Edit scene**.
2. Edit narration, visual/motion description, visual type or caption highlights. Save changes. Confirm the version increases and reload preserves the changes. Previous versions remain in history; scene IDs/order and other scenes remain unchanged.
3. Choose custom pronunciation text to override spoken words. Save, reload and verify it persists. Returning to automatic speech derives text from narration. Highlights must appear in narration.
4. Choose narration, visuals, or both under **Regenerate**, optionally supply direction, and generate the selected scene. This uses the configured Gemini key/model and the shared planning quota. Review **Current scene** against **Proposed scene** before choosing **Use this scene** or **Dismiss scene**. A visual-only replacement preserves speech overrides; regenerated narration resets speech to automatic.
5. In two tabs, edit the same saved version. Save one tab, then the other. The second tab keeps its draft and offers **Load latest for comparison**. Review it before explicitly keeping your edits against the latest revision and saving, or discard your draft. It never silently merges stale content.
6. A lost save response retains the same operation/key for safe retry. Do not start another edit until its outcome is resolved. Navigation warns while the editor is open. Check mobile layout and historical versions.

## API and validation

- PATCH `/api/v1/projects/:projectId/storyboard`: expectedRevision plus title and/or hook.
- PATCH `/api/v1/projects/:projectId/scenes/:sceneId`: expectedRevision plus editable scene fields from the API design. Only IDs in the active snapshot are editable. No scene insertion, deletion or reordering.
- Both PATCH endpoints require the existing session/owner/lifecycle and origin/CSRF guards, strict JSON, and an **Idempotency-Key**. The header is an implemented extension to the API design's PATCH contract, supporting exact lost-response replay. A changed request body needs a fresh key. Successful replies contain `{project, storyboard}`.
- POST `/api/v1/projects/:projectId/scenes/:sceneId/regenerate`: expectedRevision, scope NARRATION/VISUALS/BOTH, optional guidance. Requires verified email, no active job and the shared twenty-admissions/hour limit. Returns the existing durable 202 job receipt.
- Existing jobs/proposals endpoints now include SCENE_REGENERATE and SCENE. Scene proposals contain a complete replacement snapshot and targetSceneId; provider output can change only the requested scope in that scene. Applying requires matching project revision/proposal version and explicit acceptance. Stale proposals become CONFLICTED; dismissal retains history.
- Manual edits preserve PLAN_CHANGED warnings. Scene proposal acceptance also preserves these warnings. All real edits clear approval/current compiled hash, advance project revision/resourceVersion/publish fence and create NEEDS_COMPILATION snapshots. Exact canonical no-ops retain the existing snapshot/revision.
- AUTO forbids supplied speechText. OVERRIDE needs nonblank speech text when entered; changing overridden narration requires an explicit speech text or switch to AUTO. Unrelated edits preserve the override. Text/highlight limits and the 12,000-character aggregate narration bound are enforced server-side.

## Persistence and worker

F11_0001_scene_editing expands strict validators for speech overrides, scene context, proposals, PATCH receipts and redacted edit audits. Older migration definitions/checksums remain unchanged; their verification recognizes this exact forward schema.

Manual edits have null sourceProposalId/sourceJobId. The unique storyboard source index becomes a partial unique index over string sourceProposalId values, preserving one accepted snapshot per AI proposal while allowing multiple manual snapshots. Existing project/version and history indexes remain. During migration, stop web writes and planning/deletion workers while that index is replaced. Run `npm run scene:migrate`, then `npm run scene:verify`; restart the web app, one `npm run planning:worker` and the deletion worker. The storyboard CLI now migrates/verifies through F11.

An edit transaction fences the active account/project, checks revision, inserts the immutable snapshot, changes the active pointer/counters, invalidates approval, writes a content-free audit and stores the idempotency receipt atomically. Audit/receipt failure rolls back everything. Scene generation uses the existing durable claim, provider journal, lease and uncertain-outcome rules. Cancellation is cooperative after provider dispatch. Deletion cancels scene work and purges its stored context/proposals/snapshots; late completions cannot reinstall content.

Provider subject data includes scene order and content context, not internal project/scene/snapshot IDs or credentials. The server validates the exact scope-specific output fields and computes speech, estimates and content hashes. No arbitrary provider code/assets are executed.

## Verification and limits

- The full 101-test regression suite passed before final UI refinements. F11 integration coverage includes migration compatibility, immutable edits/no-op/replay, overrides, scoped regeneration, stale proposals/dismissal, ownership/revision checks, audit rollback, cancellation/deletion and HTTP security. The final affected run passed all 39 tests (nine F11 tests, including sanitized provider context). TypeScript, lint and production build passed. Atlas migration/full verification passed and the production preview plus both workers reported ready; signed-out sign-in/API checks returned 200/401 respectively.
- The committed Chrome harness `studio/tests/scenes.browser.ts` covers delayed save acknowledgement with one version, reload persistence, override retention, conflict draft comparison, scoped scene comparison/acceptance and 390/320px layout. Evidence: F11-browser-verification.json and F11-scene-editor-mobile.png. Run `npm run test:scenes-browser` with PLAYWRIGHT_MODULE and CHROME_PATH configured as in the F10 browser harness; it uses an isolated replica set and Next dev on port 3110. Stop the local preview first because build output is shared.
- One live Gemini 3.8 Flash VISUALS regeneration succeeded in an isolated database and created a PENDING proposal. No owner project was modified. See F11-live-verification.json. Broader provider failure/quota/quality behavior is not a production reliability guarantee.
- Saving is explicit in this scene editor. The existing plan editor still autosaves. No scene timeline operations, compilation/approval, generated audio or video rendering are included. Timing remains an estimate until the audio milestones. Speech normalization remains the documented versioned whitespace/NFC pass-through until F12.
- The October 27 approval-review usage limit interrupted the live test before execution. Work resumed October 28; no request was replayed blindly.
