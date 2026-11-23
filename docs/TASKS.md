# Tasks — next (M2)

1. `src/progression/`: upgrade definitions (cost curve `base * growth^level`), purchase logic, unit tests.
2. Apply upgrades to `CuttingLaser.stats` (dps, width, range, pierce/efficiency) and MP multiplier.
3. Upgrade panel UI (DOM), keyboard shortcut `U`, touch-friendly.
4. Pulse Cannon: bounded radial damage (circle scan ≤ r²·π cells), cooldown, weapon switch `1`/`2`.
5. Feedback: screen shake on large destruction, hit flash, debris tuned per material.
6. `src/audio/`: WebAudio synthesized SFX (laser hum, break, pulse), unlocked on first gesture, volume setting.
7. Balance first 10 minutes; e2e test: buy an upgrade.

Known follow-ups
- World generation for 2048×8192 should move to a Web Worker (2048² takes ~1.7 s boot incl. generation in headless).
- Touch: only fire+drift implemented; on-screen move controls later.
