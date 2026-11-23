/**
 * On-screen virtual joystick for touch devices. Writes a normalised axis
 * into `out` (read by the simulation). Shown only on coarse pointers or
 * after the first touch.
 */
export class TouchStick {
  readonly el: HTMLElement;
  private readonly knob: HTMLElement;
  private pointerId = -1;
  private cx = 0;
  private cy = 0;
  private readonly radius = 48;

  private out: { x: number; y: number };

  constructor(parent: HTMLElement, out: { x: number; y: number }) {
    this.out = out;
    this.el = document.createElement('div');
    this.el.className = 'touch-stick hidden';
    this.el.id = 'touch-stick';
    this.knob = document.createElement('div');
    this.knob.className = 'touch-knob';
    this.el.append(this.knob);
    parent.append(this.el);

    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (coarse) this.show(true);
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.show(true);
    }, { passive: true });

    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.pointerId = e.pointerId;
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already-released pointer */
      }
      const r = this.el.getBoundingClientRect();
      this.cx = r.left + r.width / 2;
      this.cy = r.top + r.height / 2;
      this.move(e.clientX, e.clientY);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.move(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = -1;
      this.out.x = 0;
      this.out.y = 0;
      this.knob.style.transform = 'translate(-50%, -50%)';
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  /** Points the stick at a new game's input (after starting a new world). */
  rebind(out: { x: number; y: number }): void {
    this.out = out;
  }

  show(v: boolean): void {
    this.el.classList.toggle('hidden', !v);
  }

  get active(): boolean {
    return this.pointerId !== -1;
  }

  private move(px: number, py: number): void {
    let dx = px - this.cx;
    let dy = py - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx = (dx / d) * this.radius;
      dy = (dy / d) * this.radius;
    }
    // Small dead zone avoids drift from imprecise thumbs.
    const n = Math.hypot(dx, dy) / this.radius;
    this.out.x = n < 0.15 ? 0 : dx / this.radius;
    this.out.y = n < 0.15 ? 0 : dy / this.radius;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}
