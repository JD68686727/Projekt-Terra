# Blakeridge integration

Status: standalone. No Blakeridge SDK specification available yet; none is assumed.

## Package
`npm run build` → upload the contents of `dist/` (entry `index.html`, all paths relative, no CDN, no backend). Current size ≈ 0.6 MB uncompressed.

## Verified (Chromium)
- Runs from a nested path (`/games/terra/`).
- Runs in an `<iframe>`; wheel/touch input does not scroll the parent page.
- Responsive canvas (DPR capped at 2), no distortion.
- Simulation pauses when the tab is hidden.

## Adapter
`src/platform/BlakeridgeAdapter.ts` defines `init`, `loadingProgress`, `gameplayStart/Stop`, `onPause/onResume`. Only `StandaloneAdapter` exists. A real adapter plugs in via `createPlatformAdapter()`.
If parent-window messaging is added: fixed message schema, `event.origin` allow-list, never touch the parent DOM/storage.

## Pending
Audio after first gesture (M2), IndexedDB saves (M4), cloud saves only once a platform API exists.
