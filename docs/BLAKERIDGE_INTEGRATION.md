# Blakeridge integration

Status: standalone. No Blakeridge SDK specification available yet; none is assumed.

## Package
`npm run package` → `release/projekt-terra-<version>.zip` with `index.html` at the zip root. The script fails if index.html is missing, root-absolute or external (CDN) URLs appear, or the download exceeds 20 MB. v0.9.0: 13 files, 0.59 MB raw / 0.18 MB zipped.

## Hosting requirements (all optional-free)
- Static file hosting; any sub-path works (`base: './'`).
- iframe: no special permissions required. If the iframe is sandboxed, allow `allow-scripts allow-same-origin` (needed for IndexedDB saves and the world-generation Web Worker); without same-origin the game still runs but saves fall back to memory with a visible warning, and generation falls back to the main thread.
- No cookies, no network requests after load.

## Verified (Chromium)
- Runs from a nested path (`/games/terra/`).
- Runs in an `<iframe>`; wheel/touch input does not scroll the parent page.
- Responsive canvas (DPR capped at 2), no distortion.
- Simulation pauses when the tab is hidden.

## Adapter
`src/platform/BlakeridgeAdapter.ts` defines `init`, `loadingProgress`, `gameplayStart/Stop`, `onPause/onResume`. Only `StandaloneAdapter` exists. A real adapter plugs in via `createPlatformAdapter()`.
If parent-window messaging is added: fixed message schema, `event.origin` allow-list, never touch the parent DOM/storage.

## Persistence
Local IndexedDB saves (database `projekt-terra`), no account needed. `SaveStore` interface allows a Blakeridge cloud store later. Falls back to in-memory (with a warning) if storage is blocked, e.g. in some sandboxed iframes.

## Pending
Cloud saves only once a platform API exists.
