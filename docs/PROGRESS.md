# Progress

## 2026-11-23 — M3 complete
- Reactions (`src/world/Reactions.ts`): resonance spreads through 4-connected crystal cells, one BFS layer per tick (visible wave), depth-limited, ≤400 cells/tick, queue cap 32k, per-cell charged flags (no duplicates/loops). Unstable ore detonates on destruction (deterministic chance), blasts queued (≤24/tick, cap 512), chains through ore without recursion.
- Resonance Fragments (RF): 0.25 RF per resonated crystal cell; RF-priced upgrades.
- Automation: auto-targeting (T, 48-ray scan every 8 ticks, material-aware upgrade), stationary laser emitters (E, slots upgradeable, 32-ray retarget).
- New upgrades: resonance depth, ore volatility, auto-targeting, material recognition, emitter unlock/slots/power.
- FX/SFX: resonance sparks + chime, blast debris + shake + boom; HUD RF, emitter count; touch buttons T/E.
- Camera looks slightly below the rig.
- Delegation: `targeting.ts`, `Emitter.ts` + tests by sonnet-engineer subagent; lead review found idle emitters rescanning every tick (fixed), then integrated.
- Pacing (bot): first upgrade 7 s, auto-targeting ~1:50, emitter ~2:50, pulse ~2:50.
- Tests: 41 unit, 8 e2e (Chromium). Bench unchanged (sim 0.5-0.7 ms/frame).

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
