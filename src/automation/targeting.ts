import type { World } from '../world/World';
import { Mat, MATERIALS } from '../world/materials';
import { traverseGrid } from '../world/raycast';

export interface TargetResult {
  /** Cell-centre coordinates (x + 0.5, y + 0.5). */
  x: number;
  y: number;
  found: boolean;
}

// Module-level scratch state so findTarget allocates nothing per call.
let sWorld: World;
let sOx = 0;
let sOy = 0;
let sHitX = 0;
let sHitY = 0;
let sHitDist = 0;
let sHit = false;

function visit(cx: number, cy: number, dist: number): boolean {
  // Skip the cell the emitter itself sits in.
  if (cx === Math.floor(sOx) && cy === Math.floor(sOy)) return true;
  if (sWorld.getMat(cx, cy) === Mat.Air) return true;
  sHit = true;
  sHitX = cx;
  sHitY = cy;
  sHitDist = dist;
  return false;
}

/**
 * Casts `rays` rays evenly over 360 degrees and picks the best first-solid hit.
 * Nearest wins unless `materialAware`, which maximises value / (1 + dist*0.05).
 * Work is bounded by rays * (ceil(range*2)+2) cell visits.
 */
export function findTarget(
  world: World,
  ox: number,
  oy: number,
  range: number,
  rays: number,
  materialAware: boolean,
  out: TargetResult,
): boolean {
  out.found = false;
  if (rays <= 0 || range <= 0) return false;
  sWorld = world;
  sOx = ox;
  sOy = oy;
  let bestScore = -Infinity;
  let bestDist = Infinity;
  const step = (Math.PI * 2) / rays;
  for (let i = 0; i < rays; i++) {
    const a = i * step;
    sHit = false;
    traverseGrid(ox, oy, Math.cos(a), Math.sin(a), range, visit);
    if (!sHit || sHitDist > range) continue;
    const score = materialAware
      ? MATERIALS[world.getMat(sHitX, sHitY)].value / (1 + sHitDist * 0.05)
      : -sHitDist;
    if (score > bestScore || (score === bestScore && sHitDist < bestDist)) {
      bestScore = score;
      bestDist = sHitDist;
      out.x = sHitX + 0.5;
      out.y = sHitY + 0.5;
      out.found = true;
    }
  }
  return out.found;
}
