# Progress

## 2026-11-23 — M6 complete (release candidate 0.9.0)
- Pacing: per-core resonance shields ×1/×3/×6 (damage divisor on Core Material) → bot cores at 18.4 / 29.3 / 43.3 min (gaps 11 / 14 min, pinned by test). Scanner shows core index and shield.
- Touch: virtual joystick (coarse pointers / first touch), merged into Input; phones start at zoom 5.
- Renderer upload budget (≤48 chunks/frame, visible first, rest re-queued).
- Polish: pulsing core shield rings, ending text.
- Release: `npm run package` → validated zip (13 files, 0.59 MB raw, 0.18 MB zip), README, RELEASE_NOTES, integration doc (iframe sandbox notes).
- Tests: 100 unit, 15 e2e (Chromium, incl. emulated mobile touch). Bench 1024×2048: sim 0.35 ms avg / 0.7 p95, render 0.72 ms.

## 2026-11-23 — M5 complete (full game loop)
- Weapons: Drill Missile (tunnels, too-hard stop, splitting children, wide head), Nano Swarm (deterministic leashed miners, ≤8 searches/tick), Fracture Charge (fuse, energy-limited 8-connected crack front with deterministic jitter, crystal conducts, ≤350 cells/tick, safety cap).
- 13 new upgrades (drill/nano/fracture families), weapon bar 1–5 + Q cycling; locked weapons hidden.
- World 1024×2048, 3 cores staggered shallow→deep, deeper cores larger with thicker shells. Toast per core; final screen after all cores.
- Replayability: "Neue Welt" after victory → new seed, Echo/prestige level (+50 % MP per level, persisted).
- Secrets: hidden vaults (titanium rooms with crystal floors) → +30 RF and MP bonus once each.
- Save format v2 (prestige, vaults, nano anchor) with v1→v2 migration + tests.
- Bug found by e2e: taps shorter than a frame never reached the simulation → clicks are now latched in Input (fixes nano/fracture on touch).
- Pacing probe (bot, all weapons): cores at ~18 / 22.5 / 25.5 min; humans estimated 45–60 min. Later cores still close together → M6 tuning.
- Delegation: DrillMissile/NanoSwarm + 12 tests by sonnet-engineer, reviewed and integrated unchanged.
- Tests: 98 unit, 14 e2e (Chromium). Bench 1024×2048: boot 0.9 s, sim 0.56 ms avg, heap 32 MB.

## 2026-11-23 — M4 complete (playable MVP)
- World 1024² by default, generated in a Web Worker (`src/workers/worldgen.worker.ts`, main-thread fallback), loading bar.
- Generation is a pure function (`generateMaterials`) → saves store only modified chunks.
- Resonance core: Core Material sphere (20 000 hp/cell) in a Titanium shell (2 500 hp) with crystal halo, placed deterministically deep underground. HUD scanner (direction + distance) and core progress bar. Victory screen with stats, continue playing afterwards.
- Saves (`src/storage/`): IndexedDB, versioned format, RLE chunk encoding + sparse hp overrides, main+backup rotated in one transaction, strict validation, recovery from backup, memory fallback when storage is blocked, explicit error toasts. Autosave every 30 s, on pause, tab hide, pagehide, after start; manual save; reset with in-page confirmation.
- Menus: Continue / New game (confirm when overwriting) / Settings (volume, graphics quality: particles + DPR cap, persisted in localStorage with guards); pause menu with save, settings, reset.
- Balance: late-game cost curves steepened after a time-to-victory probe showed the core falling in 3.4 min. Now: bot victory ~9.7 min; auto-targeting ~1:40, emitter ~2:50, pulse ~3:45.
- Delegation: save layer by sonnet-engineer (36 tests); lead review fixed backup rotation (corrupted main could have overwritten the last good backup) + regression test.
- Tests: 79 unit, 12 e2e (Chromium).

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
