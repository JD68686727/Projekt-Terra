# Progress

## 2026-11-23 — M2 complete
- Progression: 10 upgrades (laser damage/width/range/pierce, MP multiplier, drive, pulse unlock/damage/radius/cooldown), exponential costs, prerequisites, stat derivation.
- Upgrade panel (U / button), weapon bar (1/2/Q, touch buttons), affordable-upgrade glow.
- Pulse Cannon: detonates at first solid cell, expanding shockwave damages only the annulus crossed per tick (bounded), cooldown.
- Feedback: screen shake on pulses and mass destruction, ring FX, adaptive debris density.
- Audio: synthesised WebAudio SFX (laser hum, crumble, pulse boom, purchase/denied), unlocked on Play, suspended on pause/hidden tab, volume slider in pause menu, M = mute.
- Balance: bot simulation (tests/unit/balance.test.ts) — first upgrade ~7 s, 9 upgrades in 2 min, pulse at ~3.5 min.
- Tests: 27 unit, 6 e2e (Chromium). Delegation: none (tightly coupled changes).
- Note: progress is not saved yet (IndexedDB in M4).

## 2026-11-23 — M0 + M1 complete
- Scaffold: Vite 8 / TS 7 / PixiJS 8 / Vitest 5 / Playwright 1.65; relative base; agent definitions.
- World: 64×64 chunks, typed arrays, seeded generation (surface, caves, crystal veins, ore pockets, dense rock, titanium bands).
- Renderer: per-chunk buffer textures with partial row uploads, culling, nearest sampling, edge shading, damage cracks, backdrop.
- Player rig with terrain collision; Cutting Laser (DDA, bounded); pooled particles; smooth camera + zoom.
- UI: main menu, pause (Esc/P), HUD (MP, destroyed, depth), perf overlay (F3).
- Tests: 16 unit, 5 e2e (Chromium only). Bench in docs/TESTING.md.
- Delegation: none in M1 — tasks were tightly coupled and small; subagent overhead exceeded benefit.

Next: M2 (see docs/TASKS.md).
