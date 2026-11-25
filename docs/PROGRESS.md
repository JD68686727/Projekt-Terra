# Progress

## 2026-11-23 — Environment art direction overhaul
- Replaced procedural/geometric backdrop (polygon mountains, round bushes, block cliffs) with an illustrated rock + foliage kit and clear depth layers; terrain stone matches the backdrop rock language.
- Perf: progressive sliced chunk painting → terrain p95 4.5 ms (was 24.5 ms after the richer stone art).
- Tests: 104 unit, 15 e2e green. Known limits: procedural (not hand-painted); ores unchanged (next); Firefox/WebKit/real GPUs untested.

## 2026-11-23 — HD art pass + fog of war
- Terrain drawn at 4×4 art pixels per cell (2×2 on low quality); chunk textures pooled (max 72, LRU) so GPU memory is independent of world size; newly visible chunks painted closest-first (3/frame), dirty rows partially re-uploaded.
- Organic eroded edges with outlines and rounded corners, mossy lips, grass blades, ceiling drips, glowing cave fungi, HD cave back-wall with props.
- Fog of war (FogMap, 4-cell texels, linear-filtered cloudy fog), persisted in save v3 (+ v2→v3 migration). Revealed around rig (46), emitters, nano area.
- HD backdrop: dithered 4-stop sky, colour nebula, 420 stars incl. cross stars, gas giant (bands, storm, terminator, ring with gap), cratered moon, three tileable parallax ridges with crests, strata and glowing alien plants.
- Camera default zoom 4 (phones 3) = 1 screen px per art px; particles halved; lighting milder (fog now does the hiding); nano deploy range 130.
- Tests: 104 unit, 15 e2e. Bench 1024×2048: terrain 0.6 ms, render 1.25 ms, heap 52 MB.

## 2026-11-23 — Art pass ("indie detail")
- Terrain palettes/patterns per material, moss, rims, AO; depth darkness + rig light; bloom; parallax pixel sky with gas giant; natural cave back-wall with props; dust motes; pixel sprites for rig/emitters; pixel font + framed UI.
- Fixed during review: stretched sky dither, off-screen planet/stars, brick-like back-wall, bloom filterArea clipping half the screen, messy planet ring, noisy stone dithering.
- Tests: 100 unit, 15 e2e still green. Terrain repaint cost ~1 ms avg/frame (was 0.06 ms) due to richer per-cell shading.

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

## HUD redesign (post RC)
- Hand-drawn 12×12 pixel icons (`src/ui/icons.ts`, char maps → data URLs).
- Resource panel (MP/RF with icons, depth/destroyed/emitter stats), core compass (8-dir arrow, progress ring, distance, shield).
- Action bar with square slots: icon, key badge, conic cooldown, lock state, affordable-upgrade badge.
- Upgrade panel: wallet, category tabs, cards with icon, level pips and currency-coded buy buttons. All test IDs unchanged.

## Controls and automation pass (post RC)
- Laser auto-aims from the start (48-ray scan every 8 ticks, biased toward the flight direction); holding mouse/Space takes over manual aim. Other weapons still use the cursor.
- Upgrade `autoTarget` is now **Autopilot** (T): flies to the nearest core and tunnels (3×3 footprint probe, laser digs the blocking cell). Manual WASD input pauses it.
- New automation upgrades: **Auto-Pulse** (needs Pulse) and **Auto-Bohrer** (needs Drill), both only active while the autopilot is on.
- Pacing bots unchanged (they never modelled aim). Tests: +3 e2e (auto laser, autopilot tunnelling, auto pulse/drill); save test now pauses before snapshotting.
- Pages workflow re-triggered after enabling Pages (Source: GitHub Actions).
- Autopilot rework (feedback: it dove straight at the core): now strip-mines layer by layer — sweeps horizontally along the terrain contour in 7-row bands, goes one band deeper per pass, the ±90-cell window drifts toward the nearest core, dives straight in within 45 cells. Laser slows the sweep while chewing.
- Planet rotation smoothed: sub-column linear sampling of the band/ring maps (map 512×96, ring 1024), redraw at 25 Hz (~1 ms), so palette steps shift pixel by pixel instead of jumping.
- Parallax smoothness: backdrop layers now use the exact (un-snapped) camera position (Camera.fracX/Y compensation) and distant layers (sky, nebula, far mountains, moon, planet) use linear filtering so slow parallax moves sub-pixel; near layers stay crisp/nearest.

## Endgame pass — Echo loop + clear goal
- HUD goal line (`#hud-goal`): "ZIEL: i/n KERNE ZERSTÖREN" (+ Echo level); turns into a button after victory to reopen the final screen. Start toast states the goal.
- Each Echo adds one core (`coreCountFor`: 3 → max 6) with extra shield tiers `[1,3,6,9,12,16]`; core radius/shell capped. Saves store `cores` (absent = 3).
- Victory awards Echo fragments (`2 × cores + prestige`). New group ECHO in the upgrade panel (currency `echo`): Echo-Raffinerie (+20 % MP), Echo-Laser (+20 % dmg), Echo-Vorrat (start MP), Echo-Antrieb (+10 % speed), Echo-Resonanz (+25 % RF). Levels + fragments carry into each new world (`Game opts.carry`); saved via `progression.echo` (optional field, no version bump).
- Tests: 111 unit, 19 e2e (victory test extended: award, shop, carry-over, 4 cores). Not validated: real play balance of 4–6 core worlds (no pacing bot for Echo worlds yet).

## Echo biomes
- `src/rendering/biome.ts`: 5 biomes cycling by Echo level (ERDE, ROTE WÜSTE, DSCHUNGEL, EISWELT, GOLDENE KRUSTE). Underground palettes (stone, dense rock, moss, cave wall) via HSL ramps (`applyBiome` in materialArt); sky/nebula/ridges/planet hue-rotated (`shiftPixels` in Backdrop `tex()`, planet palette). Ores, crystals, titanium, cores keep their colours. Echo 0 = original look.
- Biome name shown in goal line, start toast and next-world button. `?echo=N` URL param starts a new game at that Echo (testing). Loaded saves now start with their saved Echo level (biome + core count).
- Verified visually in Chrome (SwiftShader) for biomes 0–4; 116 unit, 20 e2e green. Not verified: Echo-world loading from a real save (no dedicated test), other browsers/GPUs.

## Echo depth
- New worlds are 512 cells deeper per Echo (`worldHeightFor`: 2048 → 4096 cap), width stays 1024; victory button shows the next depth. Loaded saves keep their stored size.
- Bench (headless SwiftShader, indicative only): 1024×2048 / 3072 / 4096 → boot ≈1.2–1.4 s, sim ≈0.3 ms, terrain ≈8–11 ms, heap ≈52 MB — no measurable growth with depth (chunks are lazy). Real GPU/mobile untested; save size of a deep, heavily dug world untested.
