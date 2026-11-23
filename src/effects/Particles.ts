import { Container, Sprite, Texture } from 'pixi.js';

/**
 * Pooled debris/spark particles. Fixed capacity; when full, the oldest slot
 * is recycled. No allocation after construction.
 */
export class Particles {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly gravity: Float32Array;
  private next = 0;
  capacity: number;
  active = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      const s = new Sprite(Texture.WHITE);
      s.width = 1;
      s.height = 1;
      s.visible = false;
      this.sprites.push(s);
      this.container.addChild(s);
    }
  }

  emit(x: number, y: number, vx: number, vy: number, color: number, life: number, size = 1, gravity = 60, additive = false): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const s = this.sprites[i];
    if (this.life[i] <= 0) this.active++;
    s.visible = true;
    s.position.set(x, y);
    s.tint = color;
    s.alpha = 1;
    // HD: particles are half-cell sized so they match the finer art pixels.
    s.width = size * 0.5;
    s.height = size * 0.5;
    s.blendMode = additive ? 'add' : 'normal';
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      const s = this.sprites[i];
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        s.visible = false;
        this.active--;
        continue;
      }
      this.vy[i] += this.gravity[i] * dt;
      this.vx[i] *= 0.985;
      s.x += this.vx[i] * dt;
      s.y += this.vy[i] * dt;
      s.alpha = Math.min(1, (this.life[i] / this.maxLife[i]) * 1.5);
    }
  }
}
