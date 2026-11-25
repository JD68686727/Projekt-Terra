/**
 * Timer that keeps ticking while the tab is hidden. Browsers throttle main-thread
 * timers and stop requestAnimationFrame in background tabs; a dedicated worker's
 * timer is not throttled the same way, so it posts a message every 100 ms instead.
 * Falls back to a (throttled) main-thread interval if workers are unavailable
 * (for example blocked by a CSP).
 */
export class BackgroundTicker {
  private worker: Worker | null = null;
  private url: string | null = null;
  private fallback = 0;
  private running = false;

  constructor(private readonly onTick: () => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    try {
      const src = 'let id=0;onmessage=(e)=>{clearInterval(id);if(e.data==="start")id=setInterval(()=>postMessage(0),100);};';
      this.url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      this.worker = new Worker(this.url);
      this.worker.onmessage = () => this.onTick();
      this.worker.onerror = () => this.useFallback();
      this.worker.postMessage('start');
    } catch {
      this.useFallback();
    }
  }

  stop(): void {
    this.running = false;
    this.worker?.postMessage('stop');
    this.worker?.terminate();
    this.worker = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    clearInterval(this.fallback);
    this.fallback = 0;
  }

  private useFallback(): void {
    this.worker?.terminate();
    this.worker = null;
    if (this.running && !this.fallback) this.fallback = window.setInterval(() => this.onTick(), 250);
  }
}
