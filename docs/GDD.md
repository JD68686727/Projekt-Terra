# Game Design Document (condensed)

**Working title:** Projekt Terra — Fracture the World (name will change)
**Genre:** Incremental destruction / mining / automation · 2D side view · sci-fi pixel art.

## Core loop
Destroy cells → earn Material Points (MP) → buy upgrades → unlock weapons → automate → trigger chain reactions → find the three hidden resonance cores → ending, optional replay.

## Player
A small hovering rig (drone), WASD/arrow keys to fly, collides with terrain. Weapons fire from the rig toward the pointer.

## Weapons (roadmap)
| Weapon | Behaviour | Milestone |
|---|---|---|
| Cutting Laser | Continuous beam, DDA ray, damage/width/range/pierce upgrades | M1 ✔ |
| Pulse Cannon | Radial shockwave, radius/damage/cooldown | M2 |
| Drill Missile | Penetrating tunnel projectile | M5 |
| Nano Swarm | Deterministic auto-miners in a region | M5 |
| Fracture Charge | Resonance propagation through crystals | M5 |

## Materials
| Material | HP | MP | Notes |
|---|---|---|---|
| Stone | 20 | 1 | surface layers |
| Dense Rock | 60 | 3 | deeper |
| Resonance Crystal | 40 | 12 | veins, resonance source (M3) |
| Unstable Ore | 30 | 8 | pockets, secondary explosions (M3) |
| Titanium Matrix | 220 | 25 | deep bands |
| Core Material | 600 | 100 | resonance cores (M4+) |

## Resources
MP for standard upgrades; Resonance Fragments (RF) for special unlocks (M3+).

## Automation ladder
Manual → auto laser targeting → stationary emitters → multiple systems → material-aware targeting → automated chain reactions.

## Resonance & reactions (M3)
- Any damage to a Resonance Crystal charges it; the charge sweeps through the connected vein (depth upgradeable), consuming it and granting RF.
- Unstable ore may detonate when destroyed (chance/radius upgradeable); blasts chain through ore pockets.

## Controls
WASD fly (laser aims itself; hold mouse/Space to aim manually or fire other weapons) · 1–5/Q weapon · T autopilot · E place emitter · U upgrades · wheel zoom · Esc pause · M mute · F3 perf.

## Full game (M5)
- 3 resonance cores, shallow → deep, each larger and better shielded. Destroying all three ends the run.
- After the ending: continue, or start a new world (Echo level +1 → permanent +50 % MP each).
- Hidden vaults reward exploration (RF + MP once).
