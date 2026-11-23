import { Application, BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { World } from '../world/World';
import { CoreSite, SKY_FRACTION, coreSites, countCoreCells, generateWorld, surfaceY } from '../world/generator';
import { SAVE_VERSION, SaveData, applySavedChunks, serializeChunks } from '../storage/saveFormat';
import type { UpgradeId } from '../progression/upgrades';
import { MATERIALS, Mat } from '../world/materials';
import { hash01, fbm } from '../world/rng';
import { TerrainRenderer } from '../rendering/TerrainRenderer';
import { Camera } from '../rendering/Camera';
import { Particles } from '../effects/Particles';
import { CuttingLaser, BeamResult } from '../weapons/CuttingLaser';
import { PulseCannon } from '../weapons/PulseCannon';
import { Progression } from '../progression/Progression';
import { Sfx } from '../audio/Sfx';
import { Reactions } from '../world/Reactions';
import { Emitter } from '../automation/Emitter';
import { findTarget, TargetResult } from '../automation/targeting';
import { FixedLoop } from './FixedLoop';
import { Input } from './Input';
import { Drone } from './Drone';

export interface GameOptions {
  worldWidth: number;
  worldHeight: number;
  seed: number;
  /** Number of hidden resonance cores. */
  cores: number;
  /** Pre-generated materials (from the worker). Generated synchronously if absent. */
  mats?: Uint8Array;
  /** Particle pool size (quality setting). */
  particles?: number;
}

export interface CoreState {
  site: CoreSite;
  total: number;
  remaining: number;
}

export interface PerfStats {
  fps: number;
  frameMs: number;
  simMs: number;
  renderMs: number;
  terrainMs: number;
  uploads: number;
  texels: number;
  particles: number;
  visibleChunks: number;
  steps: number;
}

export interface GameStats {
  destroyed: number;
  destroyedByMat: number[];
}

export type WeaponId = 'laser' | 'pulse';

const SKY = SKY_FRACTION;

export class Game {
  readonly app: Application;
  readonly world: World;
  readonly camera = new Camera();
  readonly input: Input;
  readonly progression = new Progression();
  readonly laser: CuttingLaser;
  readonly pulse: PulseCannon;
  readonly sfx = new Sfx();
  readonly drone: Drone;
  weapon: WeaponId = 'laser';
  readonly reactions: Reactions;
  readonly emitters: Emitter[] = [];
  /** Laser fires on its own at auto-selected targets. */
  autoMode = false;
  private readonly autoTarget: TargetResult = { x: 0, y: 0, found: false };
  private autoScan = 0;
  readonly perf: PerfStats = { fps: 0, frameMs: 0, simMs: 0, renderMs: 0, terrainMs: 0, uploads: 0, texels: 0, particles: 0, visibleChunks: 0, steps: 0 };
  readonly stats: GameStats = { destroyed: 0, destroyedByMat: new Array(MATERIALS.length).fill(0) };
  readonly cores: CoreState[] = [];
  /** Seconds of unpaused play. */
  playTime = 0;
  victorySeen = false;
  /** Fired once when every core is destroyed. */
  onVictory: (() => void) | null = null;
  /** Fired when a core cell is destroyed (for UI feedback). */
  onCoreHit: ((core: CoreState) => void) | null = null;
  paused = false;

  private readonly loop = new FixedLoop(60, 5);
  private readonly scene = new Container();
  private readonly terrain: TerrainRenderer;
  private readonly particles: Particles;
  private readonly beamGfx = new Graphics();
  private readonly droneGfx = new Graphics();
  private readonly waveGfx = new Graphics();
  private readonly emitterGfx = new Graphics();
  private shake = 0;
  private destroyedThisTick = 0;
  private readonly aim = { x: 0, y: 0 };
  private readonly beam: BeamResult = { endX: 0, endY: 0, hit: false };
  private firing = false;
  private lastT = 0;
  private raf = 0;
  private frameAvg = 16.7;
  private time = 0;

  constructor(app: Application, opts: GameOptions) {
    this.app = app;
    this.laser = new CuttingLaser(this.progression.laserStats());
    this.pulse = new PulseCannon(this.progression.pulseStats());
    this.world = new World(opts.worldWidth, opts.worldHeight, opts.seed);
    if (opts.mats) this.world.loadMaterials(opts.mats);
    else generateWorld(this.world, { cores: opts.cores });
    for (const site of coreSites({ width: opts.worldWidth, height: opts.worldHeight, seed: opts.seed, cores: opts.cores })) {
      const total = countCoreCells(this.world, site);
      this.cores.push({ site, total, remaining: total });
    }

    const cx = Math.floor(opts.worldWidth / 2);
    const startY = surfaceY(cx, this.world) - 12;
    this.drone = new Drone(cx + 0.5, startY);
    this.progression.onChange = () => this.applyUpgrades();
    this.camera.x = this.camera.targetX = this.drone.x;
    this.camera.y = this.camera.targetY = this.drone.y + 20;

    this.reactions = new Reactions(this.world, this.progression.reactionStats());
    this.reactions.events = {
      onResonance: (x, y) => {
        this.progression.earnRf(0.25);
        this.particles.emit(x + 0.5, y + 0.5, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, Math.random() < 0.5 ? 0xffffff : 0x7ff0ff, 0.45, 0.8, 0, true);
        this.sfx.resonance();
      },
      onBlast: (x, y, r) => {
        this.shake = Math.min(3, this.shake + 0.35);
        this.sfx.blast();
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 20 + Math.random() * 30 * r * 0.3;
          this.particles.emit(x, y, Math.cos(a) * v, Math.sin(a) * v, i % 3 ? 0xff8a2a : 0xffe0a0, 0.35 + Math.random() * 0.2, 0.8, 20, true);
        }
      },
    };
    this.world.onHit = (x, y, m) => this.reactions.onHit(x, y, m);
    this.terrain = new TerrainRenderer(this.world);
    this.particles = new Particles(opts.particles ?? 900);

    this.scene.addChild(this.createBackdrop());
    this.scene.addChild(this.terrain.container);
    this.scene.addChild(this.particles.container);
    this.scene.addChild(this.waveGfx);
    this.scene.addChild(this.emitterGfx);
    this.scene.addChild(this.beamGfx);
    this.scene.addChild(this.droneGfx);
    app.stage.addChild(this.scene);

    this.world.onDestroy = (x, y, m) => this.onCellDestroyed(x, y, m);
    this.input = new Input(app.canvas);
    this.camera.resize(app.screen.width, app.screen.height);
    app.renderer.on('resize', (w: number, h: number) => this.camera.resize(w, h));
  }

  start(): void {
    this.lastT = performance.now();
    const frame = (t: number) => {
      this.raf = requestAnimationFrame(frame);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.loop.reset();
    this.input.fire = false;
    this.firing = false;
    this.sfx.laser(false, 0, false);
  }

  /** Re-derives weapon/drone stats from upgrade levels. */
  applyUpgrades(): void {
    this.laser.stats = this.progression.laserStats();
    this.pulse.stats = this.progression.pulseStats();
    this.drone.speed = this.progression.droneSpeed();
    this.reactions.stats = this.progression.reactionStats();
    const es = this.progression.emitterStats();
    for (const e of this.emitters) e.setStats(es);
    if (!this.progression.autoTargetUnlocked()) this.autoMode = false;
    if (!this.progression.pulseUnlocked() && this.weapon === 'pulse') this.weapon = 'laser';
  }

  toggleAuto(): boolean {
    if (!this.progression.autoTargetUnlocked()) return false;
    this.autoMode = !this.autoMode;
    if (this.autoMode) this.weapon = 'laser';
    return true;
  }

  /** Places an emitter at the rig. At capacity, the oldest one is relocated. */
  placeEmitter(): boolean {
    const max = this.progression.maxEmitters();
    if (max === 0) return false;
    if (this.emitters.length >= max) this.emitters.shift();
    this.emitters.push(new Emitter(this.drone.x, this.drone.y, this.progression.emitterStats()));
    return true;
  }

  selectWeapon(w: WeaponId): boolean {
    if (w === 'pulse' && !this.progression.pulseUnlocked()) return false;
    this.weapon = w;
    return true;
  }

  private frame(t: number): void {
    const dt = Math.min((t - this.lastT) / 1000, 0.25);
    this.lastT = t;
    this.frameAvg += ((dt * 1000) - this.frameAvg) * 0.05;

    const s0 = performance.now();
    let steps = 0;
    if (!this.paused) {
      this.handleFrameInput();
      steps = this.loop.advance(dt, (h) => this.tick(h));
    }
    const s1 = performance.now();

    this.camera.targetX = this.drone.x;
    // Look slightly below the rig: the action (digging) happens downward.
    this.camera.targetY = this.drone.y + (this.camera.viewH / this.camera.zoom) * 0.12;
    this.camera.update(dt, this.world.width, this.world.height);
    this.camera.apply(this.scene);
    if (this.shake > 0.01) {
      const a = this.shake * this.camera.zoom * 0.6;
      this.scene.x += Math.round((Math.random() - 0.5) * a);
      this.scene.y += Math.round((Math.random() - 0.5) * a);
      this.shake *= Math.exp(-dt * 9);
    }
    const [x0, y0, x1, y1] = this.camera.bounds();
    this.terrain.cull(x0, y0, x1, y1);
    this.terrain.update();
    this.drawDrone();
    this.drawBeam();
    this.drawWaves();
    this.drawEmitters();
    this.sfx.laser(this.firing && this.weapon === 'laser' && !this.paused, this.progression.level('laserDamage'), this.beam.hit);

    const r0 = performance.now();
    this.app.render();
    const r1 = performance.now();

    const p = this.perf;
    p.frameMs = this.frameAvg;
    p.fps = 1000 / this.frameAvg;
    p.simMs = s1 - s0;
    p.renderMs = r1 - r0;
    p.terrainMs = this.terrain.stats.ms;
    p.uploads = this.terrain.stats.uploads;
    p.texels = this.terrain.stats.texels;
    p.visibleChunks = this.terrain.stats.visible;
    p.particles = this.particles.active;
    p.steps = steps;
    this.input.endFrame();
  }

  private handleFrameInput(): void {
    const w = this.input.consumeWheel();
    if (w) this.camera.zoomBy(Math.pow(1.0015, -w));
    if (this.input.wasPressed('Equal') || this.input.wasPressed('NumpadAdd')) this.camera.zoomBy(1.25);
    if (this.input.wasPressed('Minus') || this.input.wasPressed('NumpadSubtract')) this.camera.zoomBy(0.8);
    if (this.input.wasPressed('Digit1')) this.selectWeapon('laser');
    if (this.input.wasPressed('Digit2')) this.selectWeapon('pulse');
    if (this.input.wasPressed('KeyQ')) this.selectWeapon(this.weapon === 'laser' ? 'pulse' : 'laser');
    if (this.input.wasPressed('KeyT') && !this.toggleAuto()) this.sfx.denied();
    if (this.input.wasPressed('KeyE')) {
      if (this.placeEmitter()) this.sfx.purchase();
      else this.sfx.denied();
    }
    this.camera.screenToWorld(this.input.pointerX, this.input.pointerY, this.aim);
  }

  private tick(h: number): void {
    this.time += h;
    this.playTime += h;
    let ax = this.input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    let ay = this.input.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    // Touch: drone drifts toward the touch point while firing.
    if (this.input.touch && this.input.fire) {
      const dx = this.aim.x - this.drone.x;
      const dy = this.aim.y - this.drone.y;
      const d = Math.hypot(dx, dy);
      if (d > this.laser.stats.range * 0.6) {
        ax = dx / d;
        ay = dy / d;
      }
    }
    this.drone.update(this.world, ax, ay, h);

    this.destroyedThisTick = 0;
    this.firing = this.input.fire || this.input.keys.has('Space');
    if (this.firing && this.weapon === 'pulse') {
      const wave = this.pulse.fire(this.world, this.drone.x, this.drone.y, this.aim.x, this.aim.y);
      if (wave) {
        this.sfx.pulse();
        this.shake = Math.min(3, this.shake + 0.8 + wave.maxR * 0.05);
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          this.particles.emit(wave.x, wave.y, Math.cos(a) * 55, Math.sin(a) * 55, i % 2 ? 0x29d8f0 : 0xffffff, 0.3, 0.6, 0, true);
        }
      }
    }
    this.pulse.update(this.world, h);
    for (const e of this.emitters) e.update(this.world, h, this.progression.materialAware());
    // Auto mode: laser fires by itself at scanned targets unless the player aims manually.
    let tx = this.aim.x;
    let ty = this.aim.y;
    if (this.autoMode && this.weapon === 'laser' && !this.firing) {
      const t = this.autoTarget;
      const lost = t.found && this.world.getMat(Math.floor(t.x), Math.floor(t.y)) === Mat.Air;
      if (lost || ++this.autoScan >= 8) {
        this.autoScan = 0;
        findTarget(this.world, this.drone.x, this.drone.y, this.laser.stats.range, 48, this.progression.materialAware(), t);
      }
      if (t.found) {
        tx = t.x;
        ty = t.y;
        this.firing = true;
      }
    }
    if (this.firing && this.weapon === 'laser') {
      this.laser.fire(this.world, this.drone.x, this.drone.y, tx, ty, h, this.beam);
      if (this.beam.hit && hash01(Math.floor(this.time * 60), 7, 1) < 0.6) {
        const c = Math.random() < 0.5 ? 0xffc060 : 0xff7a1a;
        this.particles.emit(this.beam.endX, this.beam.endY, (Math.random() - 0.5) * 40, -Math.random() * 30, c, 0.25 + Math.random() * 0.2, 0.5, 30, true);
      }
    }
    this.reactions.update();
    this.particles.update(h);
    if (this.destroyedThisTick > 12) this.shake = Math.min(3, this.shake + this.destroyedThisTick * 0.004);
  }

  private onCellDestroyed(x: number, y: number, m: Mat): void {
    const def = MATERIALS[m];
    this.stats.destroyed++;
    this.stats.destroyedByMat[m]++;
    this.progression.earn(def.value);
    this.reactions.onDestroyed(x, y, m);
    if (m === Mat.CoreMaterial) this.onCoreCellDestroyed(x, y);
    this.destroyedThisTick++;
    this.sfx.cellBreak(def.value >= 8);
    // Fewer particles per cell during mass destruction keeps the pool readable.
    const n = this.destroyedThisTick > 40 ? (Math.random() < 0.3 ? 1 : 0) : def.emissive ? 3 : 2;
    for (let i = 0; i < n; i++) {
      this.particles.emit(
        x + Math.random(),
        y + Math.random(),
        (Math.random() - 0.5) * 30,
        -10 - Math.random() * 25,
        def.color,
        0.5 + Math.random() * 0.6,
        Math.random() < 0.3 ? 1 : 0.6,
        70,
        def.emissive,
      );
    }
  }

  private onCoreCellDestroyed(x: number, y: number): void {
    for (const c of this.cores) {
      const r = c.site.radius + 1;
      if (Math.abs(x - c.site.x) > r || Math.abs(y - c.site.y) > r || c.remaining === 0) continue;
      c.remaining--;
      this.onCoreHit?.(c);
      if (c.remaining === 0) {
        this.shake = 3;
        for (let i = 0; i < 80; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 20 + Math.random() * 80;
          this.particles.emit(c.site.x, c.site.y, Math.cos(a) * v, Math.sin(a) * v, i % 2 ? 0xd040ff : 0xffffff, 0.8 + Math.random() * 0.8, 1, 10, true);
        }
        this.sfx.pulse();
      }
      if (!this.victorySeen && this.cores.every((k) => k.remaining === 0)) {
        this.victorySeen = true;
        this.onVictory?.();
      }
      return;
    }
  }

  /** Nearest core that still has material, for the scanner UI. */
  nearestCore(): { core: CoreState; dist: number; dx: number; dy: number } | null {
    let best: { core: CoreState; dist: number; dx: number; dy: number } | null = null;
    for (const c of this.cores) {
      if (c.remaining === 0) continue;
      const dx = c.site.x - this.drone.x;
      const dy = c.site.y - this.drone.y;
      const dist = Math.hypot(dx, dy);
      if (!best || dist < best.dist) best = { core: c, dist, dx, dy };
    }
    return best;
  }

  /** Snapshot of all persistent state. */
  toSave(): SaveData {
    const p = this.progression;
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      seed: this.world.seed,
      width: this.world.width,
      height: this.world.height,
      progression: { mp: p.mp, totalMp: p.totalMp, rf: p.rf, totalRf: p.totalRf, levels: { ...p.levels } },
      stats: { destroyed: this.stats.destroyed, playTime: this.playTime },
      drone: { x: this.drone.x, y: this.drone.y },
      emitters: this.emitters.map((e) => ({ x: e.x, y: e.y })),
      victorySeen: this.victorySeen,
      chunks: serializeChunks(this.world),
    };
  }

  /** Restores a validated save onto a world generated from the same seed/size. */
  applySave(d: SaveData): void {
    const p = this.progression;
    p.mp = d.progression.mp;
    p.totalMp = d.progression.totalMp;
    p.rf = d.progression.rf;
    p.totalRf = d.progression.totalRf;
    for (const id of Object.keys(p.levels) as UpgradeId[]) {
      const v = d.progression.levels[id];
      if (typeof v === 'number') p.levels[id] = v;
    }
    this.stats.destroyed = d.stats.destroyed;
    this.playTime = d.stats.playTime;
    this.victorySeen = d.victorySeen;
    applySavedChunks(this.world, d.chunks);
    for (const c of this.cores) c.remaining = countCoreCells(this.world, c.site);
    this.drone.x = d.drone.x;
    this.drone.y = d.drone.y;
    this.camera.x = this.camera.targetX = this.drone.x;
    this.camera.y = this.camera.targetY = this.drone.y;
    this.applyUpgrades();
    this.emitters.length = 0;
    const es = p.emitterStats();
    for (const e of d.emitters.slice(0, p.maxEmitters())) this.emitters.push(new Emitter(e.x, e.y, es));
  }

  private drawEmitters(): void {
    const g = this.emitterGfx;
    g.clear();
    for (const e of this.emitters) {
      if (e.firing && e.beam.hit && !this.paused) {
        g.moveTo(e.x, e.y).lineTo(e.beam.endX, e.beam.endY).stroke({ width: 0.9, color: 0x29d8f0, alpha: 0.35 });
        g.moveTo(e.x, e.y).lineTo(e.beam.endX, e.beam.endY).stroke({ width: 0.3, color: 0xdfffff, alpha: 0.95 });
        g.circle(e.beam.endX, e.beam.endY, 0.8).fill({ color: 0x9ff4ff, alpha: 0.7 });
      }
      g.rect(e.x - 1, e.y - 1, 2, 2).fill(0x1b2433);
      g.rect(e.x - 1, e.y - 1, 2, 0.4).fill(0x4a5a74);
      g.rect(e.x - 0.4, e.y - 0.4, 0.8, 0.8).fill(e.firing ? 0x29d8f0 : 0x335566);
    }
  }

  private drawWaves(): void {
    const g = this.waveGfx;
    g.clear();
    for (const w of this.pulse.waves) {
      const life = Math.min(1, w.r / w.maxR);
      const fade = w.r >= w.maxR ? Math.max(0, 1 - (w.age - w.maxR / 45) / 0.25) : 1;
      g.circle(w.x, w.y, Math.max(0.5, w.r)).stroke({ width: 1.2 * (1 - life * 0.5), color: 0x29d8f0, alpha: 0.85 * fade });
      g.circle(w.x, w.y, Math.max(0.3, w.r * 0.85)).stroke({ width: 0.5, color: 0xffffff, alpha: 0.5 * fade });
      if (life < 0.35) g.circle(w.x, w.y, 2 + w.r * 0.4).fill({ color: 0xbff6ff, alpha: 0.5 * (1 - life / 0.35) });
    }
  }

  private drawBeam(): void {
    const g = this.beamGfx;
    g.clear();
    if (!this.firing || this.paused || this.weapon !== 'laser') return;
    const ox = this.drone.x;
    const oy = this.drone.y;
    const ex = this.beam.endX;
    const ey = this.beam.endY;
    const flicker = 0.8 + Math.sin(this.time * 70) * 0.2;
    const w = this.laser.stats.width;
    g.moveTo(ox, oy).lineTo(ex, ey).stroke({ width: (1.6 + w * 0.8) * flicker, color: 0xff7a1a, alpha: 0.35 });
    g.moveTo(ox, oy).lineTo(ex, ey).stroke({ width: 0.7 + w * 0.3, color: 0xffd27a, alpha: 0.9 });
    g.moveTo(ox, oy).lineTo(ex, ey).stroke({ width: 0.25, color: 0xffffff, alpha: 1 });
    if (this.beam.hit) {
      g.circle(ex, ey, 1.6 * flicker).fill({ color: 0xff9a2a, alpha: 0.5 });
      g.circle(ex, ey, 0.7).fill({ color: 0xffffff, alpha: 0.95 });
    }
  }

  private drawDrone(): void {
    const g = this.droneGfx;
    const x = this.drone.x;
    const y = this.drone.y + Math.sin(this.time * 4) * 0.15;
    g.clear();
    // Hull
    g.rect(x - 1.5, y - 1, 3, 2).fill(0x2a3140);
    g.rect(x - 1.5, y - 1, 3, 0.5).fill(0x56637a);
    // Thrusters
    g.rect(x - 2, y - 0.5, 0.5, 1.5).fill(0x1b2029);
    g.rect(x + 1.5, y - 0.5, 0.5, 1.5).fill(0x1b2029);
    g.rect(x - 2, y + 1, 0.5, 0.4 + Math.random() * 0.4).fill({ color: 0x29d8f0, alpha: 0.8 });
    g.rect(x + 1.5, y + 1, 0.5, 0.4 + Math.random() * 0.4).fill({ color: 0x29d8f0, alpha: 0.8 });
    // Core eye
    g.rect(x - 0.5, y - 0.5, 1, 1).fill(this.firing ? 0xffb040 : 0x29d8f0);
  }

  /** Low-res cave back-wall + sky, generated once. */
  private createBackdrop(): Container {
    const c = new Container();
    const sky = new Graphics();
    const w = this.world.width;
    const h = this.world.height;
    // Sky extends well below the lowest possible surface dip.
    const skyBottom = h * (SKY + 0.15);
    const bands = 16;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const col = lerpColor(0x070a14, 0x24123a, t);
      sky.rect(-w, -200 + t * (skyBottom + 200), w * 3, (skyBottom + 200) / bands + 1).fill(col);
    }
    c.addChild(sky);
    // Stars
    const stars = new Graphics();
    for (let i = 0; i < 120; i++) {
      const sx = hash01(i, 1, this.world.seed) * w * 1.5 - w * 0.25;
      const sy = -200 + hash01(i, 2, this.world.seed) * (h * SKY + 120);
      stars.rect(sx, sy, 0.5, 0.5).fill({ color: 0xbfd8ff, alpha: 0.3 + hash01(i, 3, 0) * 0.6 });
    }
    c.addChild(stars);

    const scale = 2;
    const bw = w / scale;
    const bh = h / scale;
    const px = new Uint8Array(bw * bh * 4);
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const wx = bx * scale;
        const wy = by * scale;
        const surf = surfaceY(wx, this.world);
        const p = (by * bw + bx) * 4;
        if (wy < surf + 2) continue;
        const n = fbm(wx / 16, wy / 16, this.world.seed ^ 0xbac, 3);
        const d = 1 - (wy / h) * 0.4;
        const v = (14 + n * 22) * d;
        px[p] = v * 0.9;
        px[p + 1] = v * 0.85;
        px[p + 2] = v * 1.15;
        px[p + 3] = 255;
      }
    }
    const src = new BufferImageSource({ resource: px, width: bw, height: bh, scaleMode: 'nearest', autoGenerateMipmaps: false });
    const back = new Sprite(new Texture({ source: src }));
    back.scale.set(scale);
    c.addChild(back);
    return c;
  }

  destroy(): void {
    this.stop();
    this.input.destroy();
    this.terrain.destroy();
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 0xff) + ((((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t);
  const g = ((a >> 8) & 0xff) + ((((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t);
  const bl = (a & 0xff) + (((b & 0xff) - (a & 0xff)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
