# Repository Guidelines

## Project Structure & Module Organization
- `expo-app/` — React Native/Expo app (iOS, Android, web) plus Tauri desktop; app code in `expo-app/sources/`.
- `cli/` — TypeScript CLI wrapper for Claude/Codex; source in `cli/src/`.
- `server/` — Fastify backend with Prisma; source in `server/sources/`, schema/migrations in `server/prisma/`.
- Top-level `package.json` is minimal; work primarily inside the package directories.

## Build, Test, and Development Commands
Run commands from each package directory (examples below).

- Expo app:
  - `yarn start` — Expo dev server
  - `yarn ios` / `yarn android` / `yarn web` — run on target platform
  - `yarn typecheck` — TypeScript checks
- CLI:
  - `yarn build` — build dist and binaries
  - `yarn dev` — run via tsx
  - `yarn test` — Vitest run
  - `yarn link:dev` — create global `happy-dev`
- Server:
  - `yarn dev` — start with local env files
  - `yarn start` — start server
  - `yarn test` — Vitest run
  - `yarn migrate` / `yarn generate` — Prisma tasks

## Coding Style & Naming Conventions
- TypeScript strict is expected; prefer explicit types and clear function signatures.
- `server/` and `expo-app/` use 4-space indentation; follow existing formatting in `cli/`.
- Absolute imports with `@/` are used in `expo-app/sources`, `server/sources`, and `cli/src`.
- Keep files small and cohesive; prefer named exports.

## Testing Guidelines
- Primary framework is Vitest across packages.
- Tests are colocated with source:
  - CLI: `*.test.ts`
  - Server: `*.spec.ts`
  - Expo app: `*.test.ts` (and app-specific specs where present)
- No explicit coverage target; add tests for new logic and bug fixes.

## Commit & Pull Request Guidelines
- Recent history uses conventional-style prefixes like `fix:`, `docs:`, `refactor:` and scoped forms like `fix(expo-app): ...`.
- Keep messages imperative and scope to a package when relevant.
- PRs should include a short description, testing notes (commands run), and screenshots for UI changes. Call out any server migrations or infra requirements.

## Additional Instructions
- Package-specific guidance lives in `expo-app/CLAUDE.md`, `cli/CLAUDE.md`, and `server/CLAUDE.md`; check them before non-trivial changes.
