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

Future domain modules and server-only adapters will be introduced alongside their features, not as empty service implementations. Better Auth, MongoDB, Inngest, R2 and the video pipeline are not connected yet.

## Design and contracts

Use the approved Mineral Signal tokens and Bricolage Grotesque/Manrope typography.
The PRD and API/DB documents in `../docs/` control product behavior; generated design copy does not add requirements.
Never copy `.env.local`, response caches or generated media from the POC into this app.
