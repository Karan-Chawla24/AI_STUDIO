# Educational Video Studio

The V1 application scaffold, separate from the existing `../internet-poc` video pipeline.
Implementation progress and feature acceptance criteria live in [`../PROJECT_STATUS.md`](../PROJECT_STATUS.md).

## Local development

Use Node.js 24 LTS (verified with 24.19.0) and npm. Node 22.13+ is also allowed by the package engine requirement.
The system Node 20.10 installation is too old; switch Node versions before installing or running commands.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. No environment variables or paid service calls are needed for the scaffold.
For a different port use `npm run dev -- --port 3001`.

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

These pages are explicitly labelled development previews. They are public, have no user session or database, and contain no functioning generation/publishing actions. `/` redirects to `/home` until the public homepage milestone.

MongoDB connection, transaction and migration infrastructure now lives in `src/server/db/`. A persistent database is not configured yet. Better Auth, Inngest, R2 and the video pipeline remain future features.

## Database tooling

See [F02 database setup and recovery](../docs/implementation/F02_Database_Foundation.md). Copy `.env.example` to `.env.local` and configure your own replica-set/Atlas database before running `npm run db:check`, `npm run db:migrate` and `npm run db:verify`. Migrations are explicit and never run at startup.

`npm run test:db` uses an isolated temporary MongoDB replica set, without your credentials. The first run downloads a MongoDB binary. Server modules use the `server-only` guard; CLI/test commands supply the React server condition so they can load these modules outside Next.js.

## Design and contracts

Use the approved Mineral Signal tokens and Bricolage Grotesque/Manrope typography.
The PRD and API/DB documents in `../docs/` control product behavior; generated design copy does not add requirements.
Never copy `.env.local`, response caches or generated media from the POC into this app.
