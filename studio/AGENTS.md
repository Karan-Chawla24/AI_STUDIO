# Implementation workflow

- Read `../PROJECT_STATUS.md` before making changes.
- Update it in the same change whenever features, behavior, configuration, dependencies or checks change. Record what actually passed and any remaining limitations.
- Work feature by feature. Do not mark designed or mocked functionality as implemented.
- Follow the PRD and `../docs/` API/DB contracts. Stitch is a visual reference.
- Keep secrets, provider SDKs and database access out of client components.
- Keep `../internet-poc/` as reference material until an explicit integration milestone.
- Run `npm run check` and `npm run build` for relevant scaffold changes.
- Use `dev` for ongoing development. After each completed change, update `../PROJECT_STATUS.md`, run relevant checks, then commit and push to `origin/dev`. The user authorized this ongoing workflow. Never include secrets, generated caches or unrelated local files; report any failed push accurately.
- Keep `main` for reviewed milestones. Merge `dev` into `main` through a pull request when the user approves promotion; do not push development changes directly to `main`.
- Owner review gate (2026-10-27): owner authorized F11 after the F10 review fixes. Finish scene editing/regeneration verification and activation, provide the test flow, then stop for owner testing before F12.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
