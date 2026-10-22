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

Sign-up and sign-in are public; studio pages now require an active database-backed session. Generation/publishing actions are not implemented. `/` redirects to `/home` until the public homepage milestone; unauthenticated studio access redirects to sign-in.

MongoDB infrastructure lives in `src/server/db/`; Better Auth session/profile services live in `src/server/auth/`. Inngest, R2 and the video pipeline remain future features.

## Authentication test

See [F03 setup and owner test checklist](../docs/implementation/F03_Authentication.md). Configure APP_ORIGIN and BETTER_AUTH_SECRET alongside MongoDB settings, then run `npm run auth:migrate` and `npm run auth:verify`. Start `npm run dev -- --port 3001` and open `http://localhost:3001/sign-up`.

`npm run test:auth` runs isolated account/session security tests. `npm run auth:schema` exports the pinned adapter schema. Email verification and password recovery remain intentionally unavailable until F04. Stop for owner testing before advancing.

## Database tooling

See [F02 database setup and recovery](../docs/implementation/F02_Database_Foundation.md). Copy `.env.example` to `.env.local` and configure your own replica-set/Atlas database before running `npm run db:check`, `npm run db:migrate` and `npm run db:verify`. Migrations are explicit and never run at startup.

`npm run test:db` uses an isolated temporary MongoDB replica set, without your credentials. The first run downloads a MongoDB binary. Server modules use the `server-only` guard; CLI/test commands supply the React server condition so they can load these modules outside Next.js.

## Design and contracts

Use the approved Mineral Signal tokens and Bricolage Grotesque/Manrope typography.
The PRD and API/DB documents in `../docs/` control product behavior; generated design copy does not add requirements.
Never copy `.env.local`, response caches or generated media from the POC into this app.
