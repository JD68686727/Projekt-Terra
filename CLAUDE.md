# Projekt Terra — working notes for Claude

Working title: **PROJEKT TERRA** (final name TBD — change only `src/config/meta.ts` and `<title>` in `index.html`).
Incremental destruction game, HTML5, for the PlayGrid platform. Static build, no backend.

## Stack
TypeScript 7 · PixiJS 8 (WebGL) · Vite 8 · Vitest 5 · Playwright 1.65 (uses system Chrome via `CHROME_PATH`, default `/usr/bin/google-chrome`).

## Commands
- `npm run dev` — dev server
- `npm run build` — typecheck + production build to `dist/` (relative paths)
- `npm test` — unit tests
- `npm run test:e2e` — browser tests against `dist/` served under `/games/terra/` (+ iframe harness `/embed.html`). Build first.
- `node scripts/playgrid-check.mjs` — runs dist/ under PlayGrid delivery conditions (sandbox, CSP, 2 origins). See `docs/PLAYGRID_INTEGRATION.md`.
- `npm run bench` — headless perf probe (`node scripts/bench.mjs 256,1024`)
- URL params: `?seed=N&size=N` (size multiple of 64). `window.__game` exposes state for tests.

## Rules
- Terrain = chunked typed arrays (`World`). Never one object/sprite per cell.
- Renderer re-uploads only dirty chunk rows (`BufferImageSource.update(start,end)`).
- Simulation runs in `FixedLoop` (60 Hz, max 5 catch-up steps). Bound all per-step work.
- Rendering / simulation / UI / platform stay in separate folders.
- Platform calls go through `PlatformAdapter` only. Do not invent PlayGrid SDK APIs (none exist yet; PG-07). Never modify the PlayGrid repo from here.
- Never report tests, browsers or benchmarks as passed unless actually run.
- User communication in German; code, docs, comments in English.

## Team
Opus = lead, reviews and integrates everything. Subagents: `.claude/agents/sonnet-engineer.md`, `.claude/agents/haiku-helper.md`.

## Status
See `docs/PROGRESS.md` and `docs/TASKS.md`.
