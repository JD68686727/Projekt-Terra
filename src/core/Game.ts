import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { SPRITE_SCALE, sprites } from '../rendering/sprites';
import { World } from '../world/World';
import { CoreSite, VaultSite, coreShieldLookup, coreSites, countCoreCells, generateWorld, surfaceY, vaultSites } from '../world/generator';
import { SAVE_VERSION, SaveData, applySavedChunks, serializeChunks } from '../storage/saveFormat';
import type { UpgradeId } from '../progression/upgrades';
import { MATERIALS, Mat } from '../world/materials';
import { hash01 } from '../world/rng';
import { TerrainRenderer } from '../rendering/TerrainRenderer';
import { Camera } from '../rendering/Camera';
import { Lighting } from '../rendering/Lighting';
import { Backdrop } from '../rendering/Backdrop';
import { AdvancedBloomFilter } from 'pixi-filters';
import { Particles } from '../effects/Particles';
import { CuttingLaser, BeamResult } from '../weapons/CuttingLaser';
import { PulseCannon } from '../weapons/PulseCannon';
import { DrillLauncher } from '../weapons/DrillMissile';
import { NanoSwarm } from '../weapons/NanoSwarm';
import { FractureCharge } from '../weapons/FractureCharge';
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
  /** Glow post-processing (off on low quality). */
  bloom?: boolean;
  /** Art pixels per cell edge (4 = HD, 2 = low). */
  detail?: number;
  /** Completed runs (permanent bonus). */
  prestige?: number;
}

export interface VaultState {
  site: VaultSite;
  found: boolean;
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

export type WeaponId = 'laser' | 'pulse' | 'drill' | 'nano' | 'fracture';


export class Game {
  readonly app: Application;
  readonly world: World;
  readonly camera = new Camera();
  readonly input: Input;
  readonly progression = new Progression();
  readonly laser: CuttingLaser;
  readonly pulse: PulseCannon;
  readonly drill: DrillLauncher;
  readonly nano: NanoSwarm;
  readonly fracture: FractureCharge;
  readonly vaults: VaultState[] = [];
  /** Fired when a vault is discovered (reward already granted). */
  onVault: ((rf: number, mp: number) => void) | null = null;
  private prevFire = false;
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
  /** Fired when one core is fully destroyed (index, cores destroyed so far). */
  onCoreDestroyed: ((index: number, done: number) => void) | null = null;
  paused = false;

  private readonly loop = new FixedLoop(60, 5);
  private readonly scene = new Container();
  private readonly terrain: TerrainRenderer;
  private readonly particles: Particles;
  private readonly beamGfx = new Graphics();
  private readonly droneSprite = new Sprite();
  private readonly emitterSprites = new Container();
  private readonly waveGfx = new Graphics();
  private readonly emitterGfx = new Graphics();
  private readonly lighting = new Lighting();
  private readonly backdrop: Backdrop;
  private dustTimer = 0;
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
    this.progression.prestige = opts.prestige ?? 0;
    this.laser = new CuttingLaser(this.progression.laserStats());
    this.pulse = new PulseCannon(this.progression.pulseStats());
    this.drill = new DrillLauncher(this.progression.drillStats());
    this.nano = new NanoSwarm(this.progression.swarmStats());
    this.world = new World(opts.worldWidth, opts.worldHeight, opts.seed);
    if (opts.mats) this.world.loadMaterials(opts.mats);
    else generateWorld(this.world, { cores: opts.cores });
    this.fracture = new FractureCharge(this.world, this.progression.fractureStats());
    for (const site of vaultSites({ width: opts.worldWidth, height: opts.worldHeight, seed: opts.seed, cores: opts.cores })) {
      this.vaults.push({ site, found: false });
    }
    for (const site of coreSites({ width: opts.worldWidth, height: opts.worldHeight, seed: opts.seed, cores: opts.cores })) {
      const total = countCoreCells(this.world, site);
      this.cores.push({ site, total, remaining: total });
    }
    this.world.coreShield = coreShieldLookup(this.cores.map((c) => c.site));

    const cx = Math.floor(opts.worldWidth / 2);
    const startY = surfaceY(cx, this.world) - 12;
    this.drone = new Drone(cx + 0.5, startY);
    this.progression.onChange = () => this.applyUpgrades();
    this.camera.x = this.camera.targetX = this.drone.x;
    this.camera.y = this.camera.targetY = this.drone.y + 20;

    this.reactions = new Reactions(this.world, this.progression.reactionStats());
    this.drill.onEnd = (x, y) => {
      for (let i = 0; i < 6; i++) this.particles.emit(x, y, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0xffb040, 0.3, 0.7, 0, true);
    };
    this.fracture.onDetonate = (x, y) => {
      this.shake = Math.min(3, this.shake + 1.5);
      this.sfx.pulse();
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        this.particles.emit(x, y, Math.cos(a) * 70, Math.sin(a) * 70, i % 2 ? 0xff7a1a : 0x29d8f0, 0.4, 0.8, 0, true);
      }
    };
    this.fracture.onFront = (x, y, e) => {
      if (((x * 7 + y * 13) & 3) === 0) this.particles.emit(x + 0.5, y + 0.5, 0, -5, e > 0.5 ? 0xffffff : 0x29d8f0, 0.25, 0.6, 0, true);
    };
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
    this.terrain = new TerrainRenderer(this.world, opts.detail ?? 4);
    this.particles = new Particles(opts.particles ?? 900);

    this.backdrop = new Backdrop(this.world.width, this.world.height, this.world.seed);
    this.scene.addChild(this.backdrop.container);
    this.scene.addChild(this.terrain.container);
    // Everything after the lighting layer reads as emitting light.
    this.scene.addChild(this.lighting.container);
    this.scene.addChild(this.particles.container);
    this.scene.addChild(this.waveGfx);
    this.scene.addChild(this.emitterGfx);
    this.scene.addChild(this.beamGfx);
    this.scene.addChild(this.emitterSprites);
    this.droneSprite.anchor.set(0.5, 0.45);
    this.droneSprite.scale.set(SPRITE_SCALE);
    this.scene.addChild(this.droneSprite);
    app.stage.addChild(this.scene);
    if (opts.bloom) {
      const bloom = new AdvancedBloomFilter({ threshold: 0.55, bloomScale: 0.9, brightness: 1, blur: 4, quality: 4 });
      this.scene.filters = [bloom];
    }

    this.world.onDestroy = (x, y, m) => this.onCellDestroyed(x, y, m);
    this.input = new Input(app.canvas);
    this.camera.resize(app.screen.width, app.screen.height);
    // Phones: start a bit further out so more terrain is visible.
    if (app.screen.width < 600) this.camera.zoom = this.camera.targetZoom = 3;
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
    this.input.consumeClick(); // drop clicks made while paused/in menus
    this.firing = false;
    this.sfx.laser(false, 0, false);
  }

  /** Re-derives weapon/drone stats from upgrade levels. */
  applyUpgrades(): void {
    this.laser.stats = this.progression.laserStats();
    this.pulse.stats = this.progression.pulseStats();
    this.drone.speed = this.progression.droneSpeed();
    this.reactions.stats = this.progression.reactionStats();
    this.drill.stats = this.progression.drillStats();
    this.nano.stats = this.progression.swarmStats();
    this.fracture.stats = this.progression.fractureStats();
    const es = this.progression.emitterStats();
    for (const e of this.emitters) e.setStats(es);
    if (!this.progression.autoTargetUnlocked()) this.autoMode = false;
    if (!this.weaponUnlocked(this.weapon)) this.weapon = 'laser';
  }

  cycleWeapon(): void {
    const order: WeaponId[] = ['laser', 'pulse', 'drill', 'nano', 'fracture'];
    let i = order.indexOf(this.weapon);
    for (let k = 0; k < order.length; k++) {
      i = (i + 1) % order.length;
      if (this.weaponUnlocked(order[i])) {
        this.weapon = order[i];
        return;
      }
    }
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

  weaponUnlocked(w: WeaponId): boolean {
    const p = this.progression;
    switch (w) {
      case 'laser': return true;
      case 'pulse': return p.pulseUnlocked();
      case 'drill': return p.drillUnlocked();
      case 'nano': return p.nanoUnlocked();
      case 'fracture': return p.fractureUnlocked();
    }
  }

  selectWeapon(w: WeaponId): boolean {
    if (!this.weaponUnlocked(w)) return false;
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
    this.backdrop.update(dt, this.camera.x, this.camera.y);
    this.lighting.update(this.drone.x, this.drone.y, this.drone.y - surfaceY(Math.floor(this.drone.x), this.world), [x0, y0, x1, y1]);
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
    const keys: [string, WeaponId][] = [['Digit2', 'pulse'], ['Digit3', 'drill'], ['Digit4', 'nano'], ['Digit5', 'fracture']];
    for (const [k, w] of keys) if (this.input.wasPressed(k) && !this.selectWeapon(w)) this.sfx.denied();
    if (this.input.wasPressed('KeyQ')) this.cycleWeapon();
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
    ax = Math.max(-1, Math.min(1, ax + this.input.stick.x));
    ay = Math.max(-1, Math.min(1, ay + this.input.stick.y));
    const stickUsed = this.input.stick.x !== 0 || this.input.stick.y !== 0;
    // Touch without the stick: drone drifts toward the touch point while firing.
    if (this.input.touch && this.input.fire && !stickUsed) {
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
    // Latched clicks: taps shorter than one frame still count; Space acts as a click on its rising edge.
    const space = this.input.keys.has('Space');
    const click = this.input.consumeClick() || (space && !this.prevFire);
    this.prevFire = space;
    if (this.firing && this.weapon === 'drill' && this.drill.fire(this.drone.x, this.drone.y, this.aim.x, this.aim.y)) {
      this.sfx.blast();
    }
    if (click && this.weapon === 'nano') {
      if (Math.hypot(this.aim.x - this.drone.x, this.aim.y - this.drone.y) <= 90) {
        this.nano.deploy(this.aim.x, this.aim.y);
        this.sfx.purchase();
      } else this.sfx.denied();
    }
    if (click && this.weapon === 'fracture' && !this.fracture.place(this.drone.x, this.drone.y, this.aim.x, this.aim.y)) {
      this.sfx.denied();
    }
    this.drill.update(this.world, h);
    if (this.nano.active) this.nano.update(this.world, h);
    this.fracture.update(h);
    if ((Math.floor(this.time * 60) & 15) === 0) this.checkVaults();
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
    this.emitDust(h);
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
        this.onCoreDestroyed?.(this.cores.indexOf(c), this.cores.filter((k) => k.remaining === 0).length);
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

  /** Slow, faint dust drifting through the light around the rig. */
  private emitDust(h: number): void {
    this.dustTimer -= h;
    if (this.dustTimer > 0) return;
    this.dustTimer = 0.12;
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 26;
    const x = this.drone.x + Math.cos(a) * r;
    const y = this.drone.y + Math.sin(a) * r;
    if (this.world.getMat(Math.floor(x), Math.floor(y)) !== Mat.Air) return;
    this.particles.emit(x, y, (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, Math.random() < 0.8 ? 0x384058 : 0x2c5a66, 3 + Math.random() * 3, 0.35, 0, true);
  }

  private checkVaults(): void {
    for (const v of this.vaults) {
      if (v.found) continue;
      const s = v.site;
      if (this.drone.x >= s.x0 && this.drone.x <= s.x1 + 1 && this.drone.y >= s.y0 && this.drone.y <= s.y1 + 1) {
        v.found = true;
        const rf = 30;
        const mp = Math.round(this.progression.totalMp * 0.1 + 1000);
        this.progression.earnRf(rf);
        this.progression.earn(mp);
        this.sfx.purchase();
        this.onVault?.(rf, mp);
      }
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
      prestige: this.progression.prestige,
      vaults: this.vaults.map((v) => v.found),
      nano: this.nano.active ? { x: this.nano.anchorX, y: this.nano.anchorY } : null,
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
    p.prestige = d.prestige;
    d.vaults.forEach((f, i) => {
      if (this.vaults[i]) this.vaults[i].found = f;
    });
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
    if (d.nano && p.nanoUnlocked()) this.nano.deploy(d.nano.x, d.nano.y);
  }

  private drawEmitters(): void {
    const g = this.emitterGfx;
    g.clear();
    // Drill missiles
    for (const m of this.drill.missiles) {
      g.rect(m.x - 0.6, m.y - 0.6, 1.2, 1.2).fill(0xffd27a);
      g.moveTo(m.x, m.y).lineTo(m.x - m.dx * 3, m.y - m.dy * 3).stroke({ width: 0.6, color: 0xff7a1a, alpha: 0.7 });
    }
    // Nano swarm
    if (this.nano.active) {
      const n = this.nano.stats.count;
      g.circle(this.nano.anchorX, this.nano.anchorY, this.nano.stats.leash).stroke({ width: 0.3, color: 0x29d8f0, alpha: 0.15 });
      for (let i = 0; i < n; i++) {
        g.rect(this.nano.x[i] - 0.35, this.nano.y[i] - 0.35, 0.7, 0.7).fill(this.nano.cutting[i] ? 0xffffff : 0x29d8f0);
      }
    }
    // Resonance cores: pulsing shield rings (only when on screen).
    const [bx0, by0, bx1, by1] = this.camera.bounds();
    for (const c of this.cores) {
      if (c.remaining === 0) continue;
      const s = c.site;
      if (s.x + s.shell < bx0 || s.x - s.shell > bx1 || s.y + s.shell < by0 || s.y - s.shell > by1) continue;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
      g.circle(s.x + 0.5, s.y + 0.5, s.shell + 2 + pulse * 1.5).stroke({ width: 0.6, color: 0xd040ff, alpha: 0.25 + 0.35 * pulse });
      for (let k = 1; k < s.shield; k++) {
        g.circle(s.x + 0.5, s.y + 0.5, s.shell + 3 + k * 1.6).stroke({ width: 0.3, color: 0xd040ff, alpha: 0.18 });
      }
    }
    // Fracture charges (blinking)
    for (const c of this.fracture.charges) {
      const on = Math.floor(c.fuseLeft * 8) % 2 === 0;
      g.rect(c.x - 0.2, c.y - 0.2, 1.4, 1.4).fill(on ? 0xff3b2a : 0x5a1010);
    }
    for (const e of this.emitters) {
      if (e.firing && e.beam.hit && !this.paused) {
        g.moveTo(e.x, e.y).lineTo(e.beam.endX, e.beam.endY).stroke({ width: 0.9, color: 0x29d8f0, alpha: 0.35 });
        g.moveTo(e.x, e.y).lineTo(e.beam.endX, e.beam.endY).stroke({ width: 0.3, color: 0xdfffff, alpha: 0.95 });
        g.circle(e.beam.endX, e.beam.endY, 0.8).fill({ color: 0x9ff4ff, alpha: 0.7 });
      }
    }
    // Emitter sprites (pooled to the emitter count).
    const tex = sprites().emitter;
    while (this.emitterSprites.children.length < this.emitters.length) {
      const sp = new Sprite(tex.idle);
      sp.anchor.set(0.5);
      sp.scale.set(SPRITE_SCALE);
      this.emitterSprites.addChild(sp);
    }
    while (this.emitterSprites.children.length > this.emitters.length) this.emitterSprites.removeChildAt(0).destroy();
    this.emitters.forEach((e, i) => {
      const sp = this.emitterSprites.children[i] as Sprite;
      sp.texture = e.firing ? tex.active : tex.idle;
      sp.position.set(e.x, e.y);
    });
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
    const set = sprites().rig;
    const frames = this.firing ? set.firing : set.idle;
    const sp = this.droneSprite;
    sp.texture = frames[Math.floor(this.time * 12) & 1];
    sp.position.set(this.drone.x, this.drone.y + Math.sin(this.time * 4) * 0.15);
    // Face the aim point and lean into the flight direction.
    const face = this.aim.x < this.drone.x ? -1 : 1;
    sp.scale.set(SPRITE_SCALE * face, SPRITE_SCALE);
    sp.rotation = Math.max(-0.3, Math.min(0.3, this.drone.vx * 0.008));
  }

  destroy(): void {
    this.stop();
    this.sfx.laser(false, 0, false);
    this.input.destroy();
    this.app.stage.removeChild(this.scene);
    this.terrain.destroy();
    this.scene.destroy({ children: true });
  }
}
