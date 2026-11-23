# Tasks — next (M3: automation & resonance)

1. Auto-targeting upgrade: laser picks the most valuable reachable cell in range (bounded scan, material-aware later).
2. One stationary laser emitter: placeable, fires autonomously at nearby terrain, upgradeable.
3. Resonance crystals: laser/pulse hits "charge" crystals; charged crystals propagate to connected crystal cells via a bounded per-tick event queue (max N cells/tick, no recursion).
4. Unstable ore: destruction triggers small secondary blasts (queued, capped).
5. Resonance Fragments (RF) as second currency from resonance reactions; RF-only upgrades.
6. Reaction FX (glow propagation, chain flashes) + SFX.
7. Tests: propagation bounds, no infinite loops, determinism; e2e emitter placement.

Known follow-ups
- Progress is lost on reload until M4 (IndexedDB).
- World generation for 2048×8192 should move to a Web Worker.
- Touch: on-screen movement controls still minimal (fire + drift).
