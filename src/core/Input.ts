/** Keyboard / pointer / wheel state, scoped to the game canvas element. */
export class Input {
  readonly keys = new Set<string>();
  pointerX = 0;
  pointerY = 0;
  /** Primary button / touch held. */
  fire = false;
  /** Pointer is a touch pointer (affects controls). */
  touch = false;
  /** A primary press happened since the last consumeClick() (survives taps shorter than a frame). */
  private clicked = false;
  /** Accumulated wheel delta since last consume. */
  private wheel = 0;
  private readonly pressed = new Set<string>();
  private readonly el: HTMLElement;
  private readonly abort = new AbortController();

  constructor(el: HTMLElement) {
    this.el = el;
    const o = { signal: this.abort.signal };
    const opt = { signal: this.abort.signal, passive: false };
    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (GAME_KEYS.has(e.code)) e.preventDefault();
    }, opt);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), o);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.fire = false;
    }, o);
    el.addEventListener('pointerdown', (e) => {
      this.updatePointer(e);
      this.touch = e.pointerType === 'touch';
      if (e.button === 0) {
        this.fire = true;
        this.clicked = true;
      }
      el.setPointerCapture(e.pointerId);
      el.focus({ preventScroll: true });
      e.preventDefault();
    }, opt);
    el.addEventListener('pointermove', (e) => this.updatePointer(e), o);
    const up = (e: PointerEvent) => {
      if (e.button === 0 || e.pointerType === 'touch') this.fire = false;
    };
    el.addEventListener('pointerup', up, o);
    el.addEventListener('pointercancel', up, o);
    el.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, opt);
    el.addEventListener('contextmenu', (e) => e.preventDefault(), opt);
    el.addEventListener('touchmove', (e) => e.preventDefault(), opt);
  }

  private updatePointer(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    this.pointerX = e.clientX - r.left;
    this.pointerY = e.clientY - r.top;
  }

  consumeClick(): boolean {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** True once per key press. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Clears per-frame edge state. Call at end of frame. */
  endFrame(): void {
    this.pressed.clear();
  }

  axis(neg: string[], pos: string[]): number {
    let v = 0;
    for (const k of neg) if (this.keys.has(k)) { v -= 1; break; }
    for (const k of pos) if (this.keys.has(k)) { v += 1; break; }
    return v;
  }

  destroy(): void {
    this.abort.abort();
  }
}

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}
