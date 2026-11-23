# Testing

| Suite | Command | Scope |
|---|---|---|
| Unit (Vitest) | `npm test` | progression/costs, pulse cannon, early-game pacing bot, rng, world storage/damage/dirty tracking, deterministic generation, raycast, laser, fixed loop |
| E2E (Playwright) | `npm run build && npm run test:e2e` | boot from nested path `/games/terra/`, console errors, non-black render, laser destroys terrain + MP, keyboard movement, pause, mobile viewport, iframe embedding (no parent scroll) |
| Perf probe | `npm run build && npm run bench` | frame / sim / terrain / render CPU ms, uploaded texels, heap |

## Environment notes
- Playwright's browser download CDN is blocked in the cloud sandbox. Tests use the preinstalled Chrome for Testing (`CHROME_PATH`).
- **Firefox and WebKit have not been run** (not installable here). Run locally with `npx playwright install` and add projects.
- Headless Chrome uses SwiftShader (software GL). FPS there is not representative; CPU-side timings are.

## Latest results (M1, 2026-11-23)
- Vitest: 16/16 passed.
- Playwright (Chromium 153 headless): 5/5 passed.
- Bench (SwiftShader, laser firing + drone moving, 4 s):

| World | Boot | sim avg / p95 | terrain upload avg / p95 | render submit avg / p95 | heap |
|---|---|---|---|---|---|
| 256² | 0.68 s | 0.40 / 1.2 ms | 0.13 / 0.4 ms | 0.89 / 2.3 ms | 10 MB |
| 1024² | 0.99 s | 0.29 / 1.1 ms | 0.11 / 0.2 ms | 0.72 / 1.8 ms | 19 MB |
| 2048² | 1.73 s | 0.35 / 1.7 ms | 0.07 / 0.2 ms | 0.96 / 3.8 ms | 44 MB |

FPS in that environment: ~8 (software rasterisation); real-GPU FPS not yet measured.

## Latest results (M2, 2026-11-23)
- Vitest: 27/27 passed (incl. pacing simulation).
- Playwright (Chromium 153 headless): 6/6 passed (new: buy upgrade → laser dps rises; pulse unlock, weapon switch, pulse destroys terrain; no console errors).

## Latest results (M3, 2026-11-23)
- Vitest: 41/41 passed (new: reactions bounds/termination/depth, ore chains, automation targeting + emitter, pacing incl. reactions + RF).
- Playwright (Chromium 153 headless): 8/8 passed (new: resonance chain → RF in HUD; auto-targeting + emitter mine without input).
- Bench: 256² sim 0.68 ms avg / 1.9 p95; 1024² 0.54 / 1.8 ms.

## Latest results (M4, 2026-11-23)
- Vitest: 79/79 passed (new: save format/IndexedDB/backup recovery (fake-indexeddb), time-to-victory probe on 1024²).
- Playwright (Chromium 153 headless): 12/12 passed (new: reload + Continue restores identical state, corrupted save reported without crash, core destruction → victory screen, reset with confirmation).
