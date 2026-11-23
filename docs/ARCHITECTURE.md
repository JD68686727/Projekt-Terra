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
  platform/   PlatformAdapter (+ StandaloneAdapter)
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

## Additions M3–M6
- `world/Reactions.ts` bounded resonance/ore chain processor; `world/generator.ts` pure generation (+ cores, vaults, core shields), `workers/worldgen.worker.ts`.
- `automation/` targeting + emitters; `weapons/` drill, nano, fracture.
- `storage/` versioned save format (v2) + IndexedDB store with backup rotation.
- Renderer upload budget: ≤48 chunks per frame, visible chunks first; remaining chunks re-queued.
- `ui/TouchStick.ts` virtual joystick (axis merged into `Input.stick`).

## Art pass (post-M6)
- `rendering/materialArt.ts`: 5-step palettes per material + pattern functions (strata, cracks, crystal facets, ore nuggets, riveted titanium plates, core energy rings), top-lit edges, undersides, fake AO, surface moss. Pure functions of world coords → seamless, zero texture memory.
- `rendering/Lighting.ts`: depth darkness with stepped light falloff around the rig; effects are layered above it so they read as light sources. Bloom (`pixi-filters` AdvancedBloom) on medium/high quality.
- `rendering/Backdrop.ts`: tiled dithered sky, twinkling stars, banded ringed gas giant, two parallax ridges, natural cave back-wall with props (dormant crystals, fossils, pipes). One texel per cell.
- `rendering/sprites.ts`: hand-drawn character-map sprites (rig with thruster/eye animation, emitter) at 4 art pixels per cell.
- UI: Pixelify Sans (OFL-1.1, bundled via @fontsource, no CDN), notched pixel frames.
- `npm run build && node scripts/shots.mjs` renders review screenshots to `test-results/shots/`.

## HD renderer + fog (supersedes parts of the art pass)
- `TerrainRenderer`: D×D art pixels per cell, pooled LRU chunk views, air below the surface painted as back-wall inside the chunk texture.
- `world/FogMap.ts` (state, RLE, persisted) + `rendering/FogRenderer.ts` (one linear-filtered texture, partial row uploads).
- Layer order: backdrop → terrain → fog → lighting → particles/FX → sprites.

## Environment art direction (v4)
- One visual language: light from the upper left, 4–6 tone clustered palettes (violet/lavender/indigo stone, teal + violet flora, luminous accents), no arbitrary dithering or single-pixel noise.
- `rendering/art/rock.ts`: chiselled boulders (pillow-lit blob cut by 3–4 flat faces, lit/dark rims, deliberate cracks); `formation()` shape grammar (main mass → secondary outcrop → rubble, ledges for plants); `softMountains()` for distant low-contrast silhouettes.
- `rendering/art/foliage.ts`: hand-drawn leaf-clump stamps assembled into layered canopies (lit rim clumps, darker interior/underside, selective outline); `tree()` recursive branching trunk + crown, `shrub()`, `glowPlant()`.
- `rendering/Backdrop.ts`: sky/planet/moon/stars → far mountains (haze 0.62) → secondary formations (haze 0.5, shrubs) → midground formations with trees (haze 0.14) → playable terrain.
- Terrain: Stone/Dense Rock use the same boulder language (`boulderSites/boulderStep`, Voronoi stones with crevices and lit lips); calm edges (rounded corners only), clustered grass tufts.
- Progressive terrain painting: newly visible chunks are painted in 8-row slices under a 3 ms/frame budget and shown when complete.
