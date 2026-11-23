# PlayGrid integration

PlayGrid (repo `JD68686727/PlayGrid`, formerly misnamed "Blakeridge" here) is the target portal.
Facts below were read from PlayGrid commit `4aa98ef` (2026-11-23). PlayGrid is developed separately —
**do not change it from this repo**, and do not assume APIs it does not have.

## How PlayGrid delivers a game
- Upload: one ZIP, `index.html` at the root (or a single top folder). Limits: 80 MB zip, 300 MB unpacked, 3000 files.
- Every file is checked for content vs. extension (magic bytes); nested archives and executables are rejected. Text types incl. `.js/.mjs/.css/.json/.svg`; binaries incl. `.wasm/.png/.webp/.ogg/.wav/.woff/.woff2`.
- ClamAV scan + human review before publishing.
- Served from a separate game origin at `/play-assets/<game-id>/index.html` → **relative paths only** (`base: './'`).
- Direct address-bar visits are refused (Fetch Metadata) — the game only runs inside the portal player.
- iframe: `sandbox="allow-scripts allow-pointer-lock"`, `allow="autoplay; gamepad; fullscreen 'none'"`.
  The game response also carries `CSP: sandbox allow-scripts allow-pointer-lock`.
- CSP: `default-src 'none'`; scripts/workers from self + blob/data; styles/fonts/images/media from self + data;
  `connect-src 'self'`; `Cache-Control: no-store`.

## Consequences for every PlayGrid game
- **Opaque origin**: IndexedDB, localStorage, cookies and Cache API throw `SecurityError`. Never rely on browser storage; always guard it and fall back to memory with a visible warning.
- **No persistent saves** until PlayGrid ships a platform save API (roadmap PG-07 "Game SDK", backlog). Until then, progress is lost on reload.
- No fullscreen API (the portal owns fullscreen). Pointer lock and gamepad are allowed.
- No external network: no CDN, no analytics, no remote fonts. Bundle everything.
- Web Workers: must have a main-thread fallback (Terra has one; the worker loaded fine in the check).
- Never touch `window.parent`/top; if messaging is added later, use the SDK's fixed schema only.

## Projekt Terra status
- `node scripts/playgrid-check.mjs` (after `npm run build`) reproduces the delivery above on two origins.
  Last run: boots, generates the world, laser gameplay works, no console errors or blocked requests.
  Storage blocked as expected → warning toast; progress not kept after reload.
- Package: `npm run package` → `release/projekt-terra-<version>.zip` (~0.6 MB raw, 27 files incl. font variants).
- Adapter: `src/platform/PlatformAdapter.ts` (`init`, `loadingProgress`, `gameplayStart/Stop`, `onPause/onResume`); only `StandaloneAdapter` exists. A PlayGrid adapter plugs in via `createPlatformAdapter()` once the SDK exists.
- `SaveStore` is an interface, so a PlayGrid cloud store can be added without touching game code.

## Open (blocked on PlayGrid PG-07)
- Save/load through the portal (required before release — an incremental game without saves is not shippable).
- Loading/gameplay events, pause/resume from the portal.
