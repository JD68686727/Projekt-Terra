/** Full-screen star-warp streaks for the world transition (2D canvas, ~150 stars). */
export class Warp {
  private readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D | null = null;
  private stars: { a: number; r: number; v: number }[] = [];
  private speed = 0;
  private target = 0;
  private raf = 0;
  private last = 0;
  private color = '#ffffff';

  /** The canvas only exists in the DOM while the warp runs (keeps `canvas` unique on the page otherwise). */
  constructor(private readonly host: HTMLElement) {
    this.canvas.id = 'world-warp';
  }

  start(color: string): void {
    this.host.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;
    this.color = color;
    this.canvas.width = this.canvas.clientWidth || 960;
    this.canvas.height = this.canvas.clientHeight || 540;
    this.stars = Array.from({ length: 170 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.5, v: 0.5 + Math.random() }));
    this.speed = 0.15;
    this.target = 3.5;
    this.ctx.fillStyle = '#05030a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Slow the streaks down (arrival). */
  brake(): void {
    this.target = 0.1;
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas.remove();
  }

  private frame = (now: number): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.speed += (this.target - this.speed) * Math.min(1, dt * (this.target > this.speed ? 1.6 : 3));
    const { width: w, height: h } = this.canvas;
    const cx = w / 2;
    const cy = h / 2;
    const reach = Math.hypot(cx, cy);
    ctx.fillStyle = 'rgba(5,3,10,0.28)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    for (const s of this.stars) {
      const r0 = s.r;
      s.r += (0.02 + s.r * s.v * 2.2) * this.speed * dt;
      if (s.r > 1.05) {
        s.r = Math.random() * 0.08;
        s.a = Math.random() * Math.PI * 2;
        continue;
      }
      const c = Math.cos(s.a);
      const si = Math.sin(s.a);
      ctx.globalAlpha = Math.min(1, 0.25 + s.r * 1.4);
      ctx.lineWidth = 0.6 + s.r * 2.4;
      ctx.beginPath();
      ctx.moveTo(cx + c * r0 * reach, cy + si * r0 * reach);
      ctx.lineTo(cx + c * s.r * reach, cy + si * s.r * reach);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.raf = requestAnimationFrame(this.frame);
  };
}
