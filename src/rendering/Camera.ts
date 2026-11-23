import { Container } from 'pixi.js';

/** 2D camera: world units are cells; zoom = screen pixels per cell. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 7;
  targetX = 0;
  targetY = 0;
  targetZoom = 7;
  minZoom = 1.5;
  maxZoom = 16;
  viewW = 1;
  viewH = 1;

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  zoomBy(factor: number): void {
    this.targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.targetZoom * factor));
  }

  /** Frame-rate independent smoothing toward the target. */
  update(dt: number, worldW: number, worldH: number): void {
    const k = 1 - Math.exp(-dt * 10);
    this.zoom += (this.targetZoom - this.zoom) * k;
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    // Clamp so the view stays mostly within the world.
    const hw = this.viewW / this.zoom / 2;
    const hh = this.viewH / this.zoom / 2;
    this.x = worldW > hw * 2 ? Math.min(worldW - hw, Math.max(hw, this.x)) : worldW / 2;
    this.y = Math.min(worldH - hh + 8, Math.max(hh - 40, this.y));
  }

  apply(c: Container): void {
    c.scale.set(this.zoom);
    c.position.set(Math.round(this.viewW / 2 - this.x * this.zoom), Math.round(this.viewH / 2 - this.y * this.zoom));
  }

  screenToWorld(sx: number, sy: number, out: { x: number; y: number }): void {
    out.x = (sx - this.viewW / 2) / this.zoom + this.x;
    out.y = (sy - this.viewH / 2) / this.zoom + this.y;
  }

  /** Visible world rectangle [x0, y0, x1, y1]. */
  bounds(): [number, number, number, number] {
    const hw = this.viewW / this.zoom / 2;
    const hh = this.viewH / this.zoom / 2;
    return [this.x - hw, this.y - hh, this.x + hw, this.y + hh];
  }
}
