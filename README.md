# Educational Video Studio

An educational video application using the Mineral Signal design system.

- **Application:** [`studio/`](studio/README.md)
- **Implementation source of truth:** [`PROJECT_STATUS.md`](PROJECT_STATUS.md)
- **Architecture and contracts:** [`docs/`](docs/)

The scaffold, database foundation, authentication, email verification/recovery and draft creation are implemented. F08 adds a manual plan editor with autosave and conflict review. Atlas activation is pending a database migration permission update; work pauses before F09 AI suggestions. Generation and publishing remain planned. See [editor setup and test checklist](docs/implementation/F08_Plan_Editor.md).

Use Node.js 24 LTS. From `studio/`, run `npm ci`, configure `.env.local` using `.env.example`, then `npm run plan:migrate` (includes auth setup) and `npm run dev -- --port 3001`. Open `http://localhost:3001/sign-up`. Run `npm run check`, `npm run test:auth`, `npm run test:email`, `npm run test:db`, `npm run test:projects`, `npm run test:library`, `npm run test:deletion`, `npm run test:plan` and `npm run build` for validation.

Develop on `dev`. After each completed change, update the status file, run relevant checks, commit and push to `origin/dev`. Keep `main` for reviewed milestones; promote `dev` through a pull request after owner approval. Never commit credentials or generated provider output.

The local experimental `internet-poc/` and synced `sources/` directories are not distributed with this repository. They are not required to run the scaffold. Some design references point to local POC artifacts or private Stitch previews; the documented architecture describes future work, not implemented functionality.
