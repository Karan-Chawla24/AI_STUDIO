# Educational Video Studio

An educational video application using the Mineral Signal design system.

- **Application:** [`studio/`](studio/README.md)
- **Implementation source of truth:** [`PROJECT_STATUS.md`](PROJECT_STATUS.md)
- **Architecture and contracts:** [`docs/`](docs/)

The initial scaffold is complete. Authentication, persistence, generation and publishing remain planned; current pages are labelled development previews.

Use Node.js 24 LTS. From `studio/`, run `npm ci` and `npm run dev`. Run `npm run check` and `npm run build` for validation.

Develop on `dev`. After each completed change, update the status file, run relevant checks, commit and push to `origin/dev`. Keep `main` for reviewed milestones; promote `dev` through a pull request after owner approval. Never commit credentials or generated provider output.

The local experimental `internet-poc/` and synced `sources/` directories are not distributed with this repository. They are not required to run the scaffold. Some design references point to local POC artifacts or private Stitch previews; the documented architecture describes future work, not implemented functionality.
