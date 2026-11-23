# Release notes

## 0.9.0 — Release candidate (2026-11-23)
First complete build. Final title still pending.

**Gameplay**
- Five weapons: Cutting Laser, Pulse Cannon, Drill Missile, Nano Swarm, Fracture Charge.
- 36 upgrades across laser, pulse, drill, nano, fracture, resonance, automation and systems; two currencies (Material Points, Resonance Fragments).
- Resonance chain reactions through crystal veins; volatile ore explosions.
- Automation: auto-targeting laser with material recognition, placeable laser emitters.
- World 1024×2048 with caves, veins, titanium bands and hidden vaults.
- Three resonance cores, deeper ones larger and shielded (×1 / ×3 / ×6); ending after the third core.
- Replay: "New world" with Echo level (+50 % MP per level).

**Platform**
- Static HTML5 build (≈0.6 MB, 0.18 MB zipped), relative URLs, works in sub-paths and iframes, no backend/CDN.
- Local saves in IndexedDB with autosave, backup slot and corruption recovery; settings (volume, graphics quality).
- Audio starts only after the first click; simulation and audio pause when the tab is hidden.
- Mouse/keyboard and touch (virtual stick).

**Known limitations**
- Tested in Chromium only (Firefox/WebKit not run yet).
- Performance measured headless with software rendering; real-GPU FPS not yet measured.
- No cloud saves (no platform API specified).
