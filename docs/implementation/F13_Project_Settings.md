# F13 — Voice, captions and project settings

F13 adds a private voice catalog, cached voice previews, required caption styles and saved project settings. The owner chose **No music** until licensed tracks are available and explicitly approved **Brian and Bella as American testing voices**. The Indian presets remain visible but unavailable; there is no silent substitution.

## Owner test

1. Open a project and find **Your video's sound & style** above compilation review.
2. Preview Brian or Bella, then select the desired testing voice. Preview playback uses a cached clip, not a fresh paid generation request.
3. Select Clean, Bold or Highlighted captions. Check the style example, reload and confirm the selection remains saved. Captions cannot be switched off.
4. Choose a target duration between 60 and 90 seconds. Existing scenes stay intact with a plan-change warning; generate a replacement to rewrite their content for the new duration.
5. Compile and approve a storyboard. Changing a voice, caption style or target duration clears approval. Saving identical settings preserves it.
6. Confirm **No music** is the only music option. Indian voices should be unavailable rather than represented by American voices.

The F13 upgrade clears previous approvals once because approval now includes the actual voice binding and caption catalog version. Storyboards and scene history are retained. Review the selected voice and approve again; recompilation is not required solely for changing style settings.

## Voice availability and scope

Both configured Indian voices passed accent/gender metadata checks but sample generation returned HTTP 402. Brian and Bella, account-provided default voices, each returned HTTP 200 using the existing model/key. Their cached clips decoded in Chrome at approximately 5.71 and 6.18 seconds. They consume free-account credits when generated; they are not unlimited free synthesis.

The UI labels these voices as American and for noncommercial testing. Voice Library voices are unavailable through the free API, and commercial use requires a paid plan: [ElevenLabs voices](https://elevenlabs.io/docs/overview/capabilities/voices), [text-to-speech](https://elevenlabs.io/docs/overview/capabilities/text-to-speech). This feature does not purchase a plan, enable paid overages or replace the original Indian voice IDs.

Catalog entries are enabled only when a bounded local preview and its metadata/checksum match the configured voice/model/settings fingerprint. This is cached setup validation, not a live guarantee of future provider credits or availability. Generation must revalidate dependencies when F15 is implemented.

## API contract addendum

| Endpoint | Behavior |
| --- | --- |
| GET `/api/v1/catalogs` | Authenticated, private/no-store; logical voice choices, availability/reasons, caption styles, empty music catalog, scene types and creator limits |
| POST `/api/v1/voices/:voiceKey/preview-access` | Same-origin CSRF, active session, empty object only; returns the standard AccessGrant envelope; no arbitrary TTS text and no provider request |
| GET `/api/v1/voices/:voiceKey/sample?token=…` | Active matching session and signed, unexpired grant; serves only the pinned sample; single byte-range support, bounded files and no path input |
| PATCH `/api/v1/projects/:id/settings` | Owner-scoped, CSRF, Idempotency-Key and expectedRevision required; returns `{project}` in the existing data envelope |

The settings request supports a nonempty subset of `voiceKey`, `captionStyle`, `musicAssetId`, `targetDurationSeconds`. Voice keys are `INDIAN_MALE`, `INDIAN_FEMALE` and the explicitly authorized testing additions `TEST_MALE`, `TEST_FEMALE`. Caption styles are `CLEAN`, `BOLD`, `HIGHLIGHTED`; music is currently null only. Duration is an integer from 60 through 90. Raw provider IDs/models, external URLs, captionsEnabled and unknown fields are rejected.

Unavailable selections return `VOICE_UNAVAILABLE` (409), stale revisions `REVISION_CONFLICT` (409), active work `PROJECT_BUSY` (409), invalid settings 422 and missing retry keys 428. Authentication/ownership/CSRF use existing rules. Settings are not a paid generation operation and do not require verified email; approval still does.

## Persistence and dependency binding

Settings changes share the owner/profile and project transaction fences. They atomically persist settings, increment revision/resourceVersion/publish fence, clear approval, update the current snapshot hash, audit and store the idempotency receipt. No-op settings preserve approval and revisions. Audit failures roll back the mutation; competing revisions cannot overwrite one another.

`F13_0001_project_settings` expands strict project settings and audit validators. Previous migration checksums and indexes are unchanged. Its one-time data update clears legacy approvals and hashes, advances their revisions/fences and leaves storyboard content intact. Re-running an applied migration verifies without clearing new approvals.

Approval hashes now include the selected server-side voice/model/settings fingerprint and caption catalog version. Approval checks recompute the authoritative hash and require a verified sample. Project detail reads suppress an approval if its binding no longer matches or the voice becomes unavailable. Read-time suppression does not rewrite historical approval records; before adding rendering/publishing, those operations must use the same dependency validation rather than trusting stored approval/status alone. Administrative catalog changes can temporarily leave library status projections stale until an explicit project update. A catalog remap cannot pass approval for a different current binding.

## Preview storage and setup

This milestone uses a private local catalog adapter. Samples and manifests live in ignored `studio/.local/voice-samples`, outside `public/`. `VOICE_SAMPLES_DIRECTORY` optionally selects a private deployment/test directory. F16's R2/media-asset storage and lifecycle are not implemented here.

Server configuration is documented in `.env.example`. The POC's ElevenLabs model/key and original Indian voice bindings were reused locally. The successful testing bindings are separate variables. No credential, manifest, raw voice ID or provider model is sent in the public catalog. Audio and credentials are not committed.

Prepare approved samples with `npm run voices:prepare -- TEST_MALE TEST_FEMALE`. This operator command validates provider metadata and generates one fixed sentence per missing/mismatched sample. Valid cached samples are retained; it never automatically retries an uncertain provider result. Do not rerun after a timeout without checking the provider outcome. This command uses credits; runtime preview playback does not. Copy the private samples/config to a new deployment or prepare them there. Missing files leave voices visibly unavailable.

Grants expire after 15 minutes and bind the user, session, logical voice, dependency fingerprint and sample checksum. Tampering, another session, changed sample/config and inactive identity block access. Playback supports byte ranges and always uses private/no-store, no-referrer and nosniff headers.

## Verification and next gate

Activated locally on 2026-10-29 at http://localhost:3001. TypeScript, ESLint, production build and Atlas schema/index verification passed. Both background workers report ready. Anonymous project, catalog and sample endpoints return 401; sign-in returns 200.

- 74 affected integration/regression tests passed; the final eight F13 tests additionally cover one-time legacy-approval invalidation, audit rollback and concurrent/API settings saves.
- [Browser evidence](F13-browser-verification.json): cached playback with fixture audio, unavailable Indian options, saved caption styles, approval invalidation, reload, 390/320px layouts and zero page errors.
- [Live audio evidence](F13-live-verification.json): Indian requests rejected with 402; Brian/Bella succeeded and their real cached samples decoded without further provider calls.
- Music is deliberately disabled. Preview audio is not project narration. F14 durable infrastructure, F15 narration/timing and F16 rendering/storage remain future milestones.

Stop for owner testing before F14.
