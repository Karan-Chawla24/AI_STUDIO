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
