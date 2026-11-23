# Architecture

```
src/
  config/     meta.ts (title/version — rename here)
  core/       Game (composition root), FixedLoop, Input, Drone
  world/      World (chunked typed arrays), generator, materials, rng, raycast
  rendering/  TerrainRenderer (per-chunk buffer textures), Camera
  weapons/    CuttingLaser
  effects/    Particles (pooled sprites)
  ui/         Ui (DOM overlay: menu, pause, HUD, perf), style.css
  platform/   BlakeridgeAdapter (+ StandaloneAdapter)
  audio/ storage/ workers/   (M2/M4 — empty)
```

## Terrain data
- `World` = grid of 64×64 chunks. Each chunk: `Uint8Array mat`, `Uint16Array hp`, `dirty`, `modified`, dirty row range.
- Generation is a pure function of `(seed, x, y)` → saves only need modified chunks (M4).
- Destroying a cell marks its row and the 4 neighbours' rows dirty (edge shading).

## Rendering
- One `BufferImageSource` (RGBA, nearest) + `Sprite` per chunk; chunk sprites outside the camera are culled.
- Each frame: recolour only dirty rows, then `source.update(start, end)` → PixiJS issues `texSubImage2D` for that texel range only.
- Backdrop (sky + half-res cave wall) generated once.
- Beam/drone: one `Graphics` each, redrawn per frame. Particles: fixed pool (900 sprites), ring-buffer recycling.

## Simulation
- `requestAnimationFrame` drives frames; `FixedLoop` runs 60 Hz ticks, max 5 per frame, excess dropped.
- Laser: Amanatides–Woo traversal, bounded by `range × width` cells per tick; fractional damage carried.
- Hidden tab → simulation paused (`visibilitychange`).

## Platform
- Vite `base: './'` → works under any sub-path and in iframes. No CDN, no backend.
- Input listeners are on the canvas (wheel/touch `preventDefault`), so the embedding page does not scroll.
