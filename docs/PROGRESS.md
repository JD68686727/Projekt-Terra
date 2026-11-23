# Progress

## 2026-11-23 — M0 + M1 complete
- Scaffold: Vite 8 / TS 7 / PixiJS 8 / Vitest 5 / Playwright 1.65; relative base; agent definitions.
- World: 64×64 chunks, typed arrays, seeded generation (surface, caves, crystal veins, ore pockets, dense rock, titanium bands).
- Renderer: per-chunk buffer textures with partial row uploads, culling, nearest sampling, edge shading, damage cracks, backdrop.
- Player rig with terrain collision; Cutting Laser (DDA, bounded); pooled particles; smooth camera + zoom.
- UI: main menu, pause (Esc/P), HUD (MP, destroyed, depth), perf overlay (F3).
- Tests: 16 unit, 5 e2e (Chromium only). Bench in docs/TESTING.md.
- Delegation: none in M1 — tasks were tightly coupled and small; subagent overhead exceeded benefit.

Next: M2 (see docs/TASKS.md).
