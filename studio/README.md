# Educational Video Studio

The V1 application scaffold, separate from the existing `../internet-poc` video pipeline.
Implementation progress and feature acceptance criteria live in [`../PROJECT_STATUS.md`](../PROJECT_STATUS.md).

## Local development

Use Node.js 24 LTS (verified with 24.19.0) and npm. Node 22.13+ is also allowed by the package engine requirement.
The system Node 20.10 installation is too old; switch Node versions before installing or running commands.

```sh
npm ci
npm run dev -- --port 3001
```

Open http://localhost:3001. Authentication requires the database and auth configuration below. Public forms and the build can load without a database, but account actions cannot succeed until it is configured and migrated. Keep APP_ORIGIN aligned with the hostname and port you use.

```sh
npm run check
npm run build
npm start
```

## Structure

- `src/app`: App Router pages, shared styles, loading/error boundaries as needed.
- `src/components`: Shared navigation, icons and page components.
- `(studio)`: Shared application shell for Home, Create Video, Projects, Scheduled, Connections and Settings.
- Fonts are bundled locally through Fontsource; loading the app does not contact Google Fonts.

Sign-up and sign-in are public; studio pages now require an active database-backed session. AI idea proposals are implemented in F09. Video generation/publishing remain planned. `/` redirects to `/home` until the public homepage milestone; unauthenticated studio access redirects to sign-in.

MongoDB infrastructure lives in `src/server/db/`; Better Auth session/profile services live in `src/server/auth/`. Inngest, R2 and the video pipeline remain future features.

## Authentication test

See [F03 setup and owner test checklist](../docs/implementation/F03_Authentication.md). Configure APP_ORIGIN and BETTER_AUTH_SECRET alongside MongoDB settings, then run `npm run auth:migrate` and `npm run auth:verify`. Start `npm run dev -- --port 3001` and open `http://localhost:3001/sign-up`.

`npm run test:auth` runs isolated account/session security tests. `npm run auth:schema` exports the pinned adapter schema.

F04 adds verification and password recovery. Set `EMAIL_DELIVERY=preview`, request a link through `/verify-email` or `/forgot-password`, then run `npm run email:preview` to see local messages. `npm run test:email` exercises these flows against an isolated database. See [F04 setup and owner checklist](../docs/implementation/F04_Account_Email.md). Real email delivery remains untested. The current owner review gate is recorded in `PROJECT_STATUS.md`.

## Database tooling

F05 adds owned draft creation at `/projects/new` and saved detail pages at `/projects/<id>`. Run `npm run projects:migrate` and `npm run projects:verify` before use. `npm run test:projects` uses an isolated replica set. F06 adds the project library and dashboard; the plan editor is implemented in F08 and AI idea proposals in F09; video generation remains planned. See [F05 setup and owner checklist](../docs/implementation/F05_Project_Creation.md).

See [F02 database setup and recovery](../docs/implementation/F02_Database_Foundation.md). Copy `.env.example` to `.env.local` and configure your own replica-set/Atlas database before running `npm run db:check`, `npm run db:migrate` and `npm run db:verify`. Migrations are explicit and never run at startup.

`npm run test:db` uses an isolated temporary MongoDB replica set, without your credentials. The first run downloads a MongoDB binary. Server modules use the `server-only` guard; CLI/test commands supply the React server condition so they can load these modules outside Next.js.

## Design and contracts

Use the approved Mineral Signal tokens and Bricolage Grotesque/Manrope typography.
The PRD and API/DB documents in `../docs/` control product behavior; generated design copy does not add requirements.
Never copy `.env.local`, response caches or generated media from the POC into this app.

F06: run `npm run library:migrate` and `npm run library:verify` before opening Projects or Home. `npm run test:library` checks owner isolation, search, cursor pagination and dashboard data. See [F06 setup and owner checklist](../docs/implementation/F06_Project_Library.md).

F07: run `npm run deletion:migrate` and `npm run deletion:verify` before deleting drafts. Run `npm run deletion:worker` alongside the web app for durable cleanup recovery. `npm run test:deletion` uses isolated fixtures. See [deletion setup and test checklist](../docs/implementation/F07_Project_Deletion.md).

F08 adds the plan editor and autosave at saved draft URLs and `/projects/:id/plan`. Run `npm run plan:migrate`, `npm run plan:verify` and `npm run test:plan`. Atlas activation and migration verification passed on 2026-10-24; see [editor setup and test checklist](../docs/implementation/F08_Plan_Editor.md).

F09 adds idea brainstorming/refinement and explicit proposal review. Set `GEMINI_API_KEY` / `GEMINI_MODEL`, run `npm run ideas:migrate` and `npm run ideas:verify`, then run `npm run ideas:worker` alongside the web app. Verified email is required. Run `npm run test:ideas` for isolated tests. See [F09 setup, limits and owner checklist](../docs/implementation/F09_Idea_Suggestions.md).

F10 adds reviewed storyboard generation and immutable accepted versions. Run `npm run storyboard:migrate`, `npm run storyboard:verify`, and replace the idea worker with `npm run planning:worker` (handles both ideas and storyboards). `npm run test:storyboard` runs isolated tests. See [F10 setup and owner checklist](../docs/implementation/F10_Storyboard_Generation.md).
