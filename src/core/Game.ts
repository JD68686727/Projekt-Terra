import { Application, BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { World } from '../world/World';
import { generateWorld, surfaceY } from '../world/generator';
import { MATERIALS, Mat } from '../world/materials';
import { hash01, fbm } from '../world/rng';
import { TerrainRenderer } from '../rendering/TerrainRenderer';
import { Camera } from '../rendering/Camera';
import { Particles } from '../effects/Particles';
import { CuttingLaser, BeamResult } from '../weapons/CuttingLaser';
import { FixedLoop } from './FixedLoop';
import { Input } from './Input';
import { Drone } from './Drone';

export interface GameOptions {
  worldWidth: number;
  worldHeight: number;
  seed: number;
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
  mp: number;
}

const SKY = 0.2;

export class Game {
  readonly app: Application;
  readonly world: World;
  readonly camera = new Camera();
  readonly input: Input;
  readonly laser = new CuttingLaser();
  readonly drone: Drone;
  readonly perf: PerfStats = { fps: 0, frameMs: 0, simMs: 0, renderMs: 0, terrainMs: 0, uploads: 0, texels: 0, particles: 0, visibleChunks: 0, steps: 0 };
  readonly stats: GameStats = { destroyed: 0, destroyedByMat: new Array(MATERIALS.length).fill(0), mp: 0 };
  paused = false;

  private readonly loop = new FixedLoop(60, 5);
  private readonly scene = new Container();
  private readonly terrain: TerrainRenderer;
  private readonly particles: Particles;
  private readonly beamGfx = new Graphics();
  private readonly droneGfx = new Graphics();
  private readonly aim = { x: 0, y: 0 };
  private readonly beam: BeamResult = { endX: 0, endY: 0, hit: false };
  private firing = false;
  private lastT = 0;
  private raf = 0;
  private frameAvg = 16.7;
  private time = 0;

  constructor(app: Application, opts: GameOptions) {
    this.app = app;
    this.world = new World(opts.worldWidth, opts.worldHeight, opts.seed);
    generateWorld(this.world, { skyFraction: SKY });

    const cx = Math.floor(opts.worldWidth / 2);
    const startY = surfaceY(cx, this.world, SKY) - 12;
    this.drone = new Drone(cx + 0.5, startY);
    this.camera.x = this.camera.targetX = this.drone.x;
    this.camera.y = this.camera.targetY = this.drone.y + 20;

    this.terrain = new TerrainRenderer(this.world);
    this.particles = new Particles(900);

    this.scene.addChild(this.createBackdrop());
    this.scene.addChild(this.terrain.container);
    this.scene.addChild(this.particles.container);
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
    this.camera.targetY = this.drone.y;
    this.camera.update(dt, this.world.width, this.world.height);
    this.camera.apply(this.scene);
    const [x0, y0, x1, y1] = this.camera.bounds();
    this.terrain.cull(x0, y0, x1, y1);
    this.terrain.update();
    this.drawDrone();
    this.drawBeam();

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
    this.camera.screenToWorld(this.input.pointerX, this.input.pointerY, this.aim);
  }

  private tick(h: number): void {
    this.time += h;
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

    this.firing = this.input.fire || this.input.keys.has('Space');
    if (this.firing) {
      this.laser.fire(this.world, this.drone.x, this.drone.y, this.aim.x, this.aim.y, h, this.beam);
      if (this.beam.hit && hash01(Math.floor(this.time * 60), 7, 1) < 0.6) {
        const c = Math.random() < 0.5 ? 0xffc060 : 0xff7a1a;
        this.particles.emit(this.beam.endX, this.beam.endY, (Math.random() - 0.5) * 40, -Math.random() * 30, c, 0.25 + Math.random() * 0.2, 0.5, 30, true);
      }
    }
    this.particles.update(h);
  }

  private onCellDestroyed(x: number, y: number, m: Mat): void {
    const def = MATERIALS[m];
    this.stats.destroyed++;
    this.stats.destroyedByMat[m]++;
    this.stats.mp += def.value;
    const n = def.emissive ? 3 : 2;
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

  private drawBeam(): void {
    const g = this.beamGfx;
    g.clear();
    if (!this.firing || this.paused) return;
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
        const surf = surfaceY(wx, this.world, SKY);
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
