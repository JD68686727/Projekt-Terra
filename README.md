# Projekt Terra — Fracture the World

*(working title — final name pending; change `src/config/meta.ts` + `<title>` in `index.html`)*

Original 2D pixel-art incremental destruction game for the browser (HTML5 / WebGL), built for the Blakeridge platform. Break down a procedurally generated world cell by cell, upgrade your arsenal, automate the destruction and shatter three hidden resonance cores.

## Play locally
```bash
npm install
npm run dev          # http://localhost:5173
```

## Build & package
```bash
npm run build        # typecheck + static build → dist/ (relative paths, works in sub-folders and iframes)
npm run package      # build + validation + release/projekt-terra-<version>.zip (upload this)
```
The package needs no server-side code, no Node.js and no CDN: upload the zip contents (index.html at the root) to any static host.

## Tests
```bash
npm test             # unit tests (Vitest) incl. balance / time-to-victory simulations
npm run build && npm run test:e2e   # browser tests (Playwright) against dist/ under a nested path + iframe
npm run bench        # headless performance probe
```
Playwright uses a local Chrome (`CHROME_PATH`, default `/usr/bin/google-chrome`). For Firefox/WebKit run `npx playwright install` and add projects in `playwright.config.ts`.

## Controls
WASD/arrows fly · mouse/Space fire · 1–5 or Q weapons · T auto-laser · E emitter · U upgrades · wheel/+/- zoom · Esc pause · M mute · F3 performance overlay. Touch: virtual stick + tap to fire/aim, on-screen buttons.

## Tech
TypeScript · PixiJS 8 · Vite · Web Worker world generation · IndexedDB saves. Architecture: `docs/ARCHITECTURE.md`. Status: `docs/PROGRESS.md`.
