# F12 — Compilation and storyboard approval

F12 turns an accepted storyboard into bounded static layouts and lets its owner approve an exact saved snapshot. It uses the existing Gemini model, durable planning worker and account protections. This milestone does not generate audio or render video.

## Owner test

1. Open a project with an accepted storyboard and finish any edits.
2. Choose **Indian male** or **Indian female** under **Compile and approve**. These are presets; voice previews arrive in F13.
3. Click **Compile storyboard**. Wait for completion, then review each static layout, narration and warning. Invalid layouts show scene feedback and cannot be approved.
4. Click **Approve storyboard**, then reload. Approval should remain visible.
5. Revoke approval and approve again. Change a scene or voice; approval must clear. Scene edits require compilation again, while changing the voice only requires renewed approval.
6. Historical snapshots remain read-only. Plan-only changes preserve the storyboard and display the existing plan-change warning.

## API and concurrency

All mutations require the authenticated owner, same-origin CSRF protection, an Idempotency-Key and expectedRevision. Retries retain the exact method, key and body. Compile and approval require verified email. Foreign projects remain hidden.

| Method and project-relative endpoint | Body | Result |
| --- | --- | --- |
| POST `storyboards/compile` | `{expectedRevision}` | 202 durable job; 200 with reused snapshot if already valid |
| PATCH `settings` | `{expectedRevision,voiceKey}` | 200 project; accepts INDIAN_MALE or INDIAN_FEMALE only in F12 |
| POST `approval` | `{expectedRevision,storyboardId,snapshotHash}` | 200 project with approval bound to those exact values |
| DELETE `approval` | `{expectedRevision}` | 200 project with approval cleared; does not cancel work |

Existing envelope, errors, job polling, cancellation, signed pagination and retry behavior apply. Compile jobs share the twenty-per-hour planning admission quota and one-active-job restriction. No automatic provider resend follows an uncertain outcome.

Compilation snapshots the full accepted storyboard at admission. The worker validates provider output outside the transaction, then atomically inserts an immutable version, advances the project pointer/revision/fence, records its hash and audit, and completes the job. A changed project revision produces a CONFLICTED COMPILE proposal instead of installing old output. It can be read or dismissed, never force-applied. Cancellation and project deletion discard delayed results.

Approval checks the active storyboard ID, VALID state, compiled scenes, absence of scene errors, chosen voice and server-calculated snapshot hash. The hash covers canonical storyboard content, settings and versioned compiler/template/normalizer identifiers. Approval stores approver and timestamp; the public DTO omits the approver identifier. Scene edits, accepted replacements and voice changes clear approval. Project title and plan-only changes do not change the accepted storyboard's content.

## Compiler v1 scope

- Gemini supplies bounded headlines/labels, never executable rendering code, arbitrary coordinates, URLs or template definitions.
- Trusted templates: title, vertical sequential process, hub diagram and editorial bullets. The first catalog uses teal accents and no external icons.
- Scene IDs remain stable; scene counts and order are validated. Invalid output has per-scene feedback. Oversized speech normalization retains bounded source speech and blocks approval.
- AUTO speech normalizes Unicode, spacing and a small explicit technical acronym dictionary. OVERRIDE speech is retained and flagged for review. This is not a complete number/unit/language pronunciation engine.
- Semantic reveal cues reference trusted targets and either a narration phrase or scene start with a warning. Speech mappings are phrase-level, not audio-aligned word timestamps. Motion and caption timing are completed in later audio/render milestones.
- The UI clearly labels static previews and reserves a caption area. It does not claim these are finished Remotion frames or videos.

## Database and operation

`F12_0001_compilation_approval` expands strict validators for compiled content, approval/hash, compile jobs/context/proposals and audit records. Existing indexes are sufficient; no index replacement is required. Earlier migration checksums remain unchanged and verifiers accept the exact forward schema. Partial migration retries accept either old or upgraded validators and still reject unrelated drift. The F11 source-index recovery tests remain passing.

Run `npm run compile:migrate`, then `npm run compile:verify`. The shared `planning:worker` verifies F12 before claiming work. Stop old workers and the web process before upgrading, then restart them with the same environment. Existing environment variables are reused; no new credentials are needed.

## Evidence

- Integration suite: migration repeatability, immutable compilation, invalid layout feedback, cancellation, concurrent edits/stale results, snapshot/voice binding, access/CSRF checks, revocation, no-op saves, all four template types and normalized speech overflow.
- Affected F08–F11 regression tests include migration recovery, deletion, proposals, worker safety and scene editing.
- [Browser results](F12-browser-verification.json): compilation, six previews, voice selection, approval/reload/revocation, edit invalidation, 390/320px layouts and zero page errors.
- [Live provider result](F12-live-verification.json): one Gemini 3.8 Flash compilation, VALID six-scene result in a disposable database. No owner drafts changed.

Owner testing is the next gate. F13 voice/caption/music settings, real narration, rendering and publishing remain separate milestones.
