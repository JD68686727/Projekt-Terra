/**
 * Amanatides–Woo grid traversal. Visits every cell the segment touches, in
 * order, starting with the origin cell. The visitor returns false to stop.
 * Returns the travelled distance when stopped (or maxDist).
 */
export function traverseGrid(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxDist: number,
  visit: (cx: number, cy: number, dist: number) => boolean,
): number {
  const len = Math.hypot(dx, dy);
  if (len === 0 || maxDist <= 0) return 0;
  dx /= len;
  dy /= len;
  let cx = Math.floor(ox);
  let cy = Math.floor(oy);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? cx + 1 - ox : ox - cx) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? cy + 1 - oy : oy - cy) * tDeltaY : Infinity;
  let t = 0;
  // Hard cap protects against pathological inputs.
  const maxSteps = Math.ceil(maxDist * 2) + 2;
  for (let i = 0; i < maxSteps && t <= maxDist; i++) {
    if (!visit(cx, cy, t)) return t;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      cx += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      cy += stepY;
    }
  }
  return maxDist;
}
