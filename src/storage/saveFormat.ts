import { FOG_CELL, fogRleValid } from '../world/FogMap';
import { CHUNK_SIZE, type Chunk, type World } from '../world/World';
import { MATERIALS } from '../world/materials';

export const SAVE_VERSION = 3;

const CELLS = CHUNK_SIZE * CHUNK_SIZE;
const MAX_DIM = 8192;

export interface SavedChunk {
  index: number;
  /** RLE pairs [value, runLength(1..255)] covering exactly CHUNK_SIZE*CHUNK_SIZE cells. */
  mat: Uint8Array;
  /** Cell indices whose hp differs from the material durability (never air). */
  hpIdx: Uint16Array;
  hpVal: Uint16Array;
}

export interface SaveData {
  version: number;
  savedAt: number;
  seed: number;
  width: number;
  height: number;
  progression: { mp: number; totalMp: number; rf: number; totalRf: number; levels: Record<string, number> };
  stats: { destroyed: number; playTime: number };
  drone: { x: number; y: number };
  emitters: { x: number; y: number }[];
  victorySeen: boolean;
  /** v2: completed runs (permanent MP bonus). */
  prestige: number;
  /** v2: per-vault discovered flags. */
  vaults: boolean[];
  /** v2: deployed nano swarm anchor, or null. */
  nano: { x: number; y: number } | null;
  /** v3: fog of war, RLE of revealed flags (FogMap.encode), or null. */
  fog: Uint8Array | null;
  chunks: SavedChunk[];
}

export function encodeChunk(c: Chunk): SavedChunk {
  const rle: number[] = [];
  const mat = c.mat;
  let run = 1;
  for (let i = 1; i <= CELLS; i++) {
    if (i < CELLS && mat[i] === mat[i - 1] && run < 255) {
      run++;
    } else {
      rle.push(mat[i - 1], run);
      run = 1;
    }
  }
  const idx: number[] = [];
  const val: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    const m = mat[i];
    if (m === 0) continue;
    if (c.hp[i] !== MATERIALS[m].durability) {
      idx.push(i);
      val.push(c.hp[i]);
    }
  }
  return {
    index: 0, // set by serializeChunks (needs world width)
    mat: Uint8Array.from(rle),
    hpIdx: Uint16Array.from(idx),
    hpVal: Uint16Array.from(val),
  };
}

export function decodeChunkInto(s: SavedChunk, c: Chunk): void {
  let p = 0;
  for (let i = 0; i < s.mat.length; i += 2) {
    const v = s.mat[i];
    const n = s.mat[i + 1];
    c.mat.fill(v, p, p + n);
    p += n;
  }
  for (let i = 0; i < CELLS; i++) c.hp[i] = MATERIALS[c.mat[i]].durability;
  for (let k = 0; k < s.hpIdx.length; k++) {
    const i = s.hpIdx[k];
    if (c.mat[i] !== 0) c.hp[i] = s.hpVal[k];
  }
  c.modified = true;
}

export function serializeChunks(world: World): SavedChunk[] {
  const out: SavedChunk[] = [];
  for (let i = 0; i < world.chunks.length; i++) {
    const c = world.chunks[i];
    if (!c.modified) continue;
    const s = encodeChunk(c);
    s.index = i;
    out.push(s);
  }
  return out;
}

export function applySavedChunks(world: World, chunks: SavedChunk[]): void {
  for (const s of chunks) {
    const c = world.chunks[s.index];
    if (c) decodeChunkInto(s, c);
  }
  world.markAllDirty();
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonNegInt = (v: unknown): v is number => fin(v) && v >= 0 && Number.isInteger(v);

function validChunk(s: unknown, maxIndex: number): s is SavedChunk {
  if (!isObj(s)) return false;
  if (!nonNegInt(s.index) || s.index >= maxIndex) return false;
  const { mat, hpIdx, hpVal } = s;
  if (!(mat instanceof Uint8Array) || !(hpIdx instanceof Uint16Array) || !(hpVal instanceof Uint16Array)) return false;
  if (mat.length === 0 || mat.length % 2 !== 0) return false;
  if (hpIdx.length !== hpVal.length) return false;
  let sum = 0;
  for (let i = 0; i < mat.length; i += 2) {
    const run = mat[i + 1];
    if (mat[i] >= MATERIALS.length || run < 1) return false;
    sum += run;
    if (sum > CELLS) return false;
  }
  if (sum !== CELLS) return false;
  for (let i = 0; i < hpIdx.length; i++) if (hpIdx[i] >= CELLS) return false;
  return true;
}

export function validateSave(data: unknown): data is SaveData {
  if (!isObj(data)) return false;
  if (data.version !== SAVE_VERSION) return false;
  if (!fin(data.savedAt) || !fin(data.seed)) return false;
  const { width, height } = data;
  for (const d of [width, height]) {
    if (!fin(d) || !Number.isInteger(d) || d <= 0 || d > MAX_DIM || d % CHUNK_SIZE !== 0) return false;
  }
  const p = data.progression;
  if (!isObj(p)) return false;
  if (!fin(p.mp) || !fin(p.totalMp) || !fin(p.rf) || !fin(p.totalRf)) return false;
  if (!isObj(p.levels)) return false;
  for (const v of Object.values(p.levels)) if (!nonNegInt(v)) return false;
  const st = data.stats;
  if (!isObj(st) || !fin(st.destroyed) || !fin(st.playTime)) return false;
  const dr = data.drone;
  if (!isObj(dr) || !fin(dr.x) || !fin(dr.y)) return false;
  if (!Array.isArray(data.emitters)) return false;
  for (const e of data.emitters) if (!isObj(e) || !fin(e.x) || !fin(e.y)) return false;
  if (typeof data.victorySeen !== 'boolean') return false;
  if (!fin(data.prestige) || (data.prestige as number) < 0 || !Number.isInteger(data.prestige)) return false;
  if (!Array.isArray(data.vaults) || data.vaults.length > 64 || data.vaults.some((v) => typeof v !== 'boolean')) return false;
  if (data.nano !== null && (!isObj(data.nano) || !fin(data.nano.x) || !fin(data.nano.y))) return false;
  if (data.fog !== null) {
    if (!(data.fog instanceof Uint8Array)) return false;
    const total = Math.ceil((data.width as number) / FOG_CELL) * Math.ceil((data.height as number) / FOG_CELL);
    if (!fogRleValid(data.fog, total)) return false;
  }
  if (!Array.isArray(data.chunks)) return false;
  const maxIndex = ((width as number) / CHUNK_SIZE) * ((height as number) / CHUNK_SIZE);
  const seen = new Set<number>();
  for (const c of data.chunks) {
    if (!validChunk(c, maxIndex) || seen.has(c.index)) return false;
    seen.add(c.index);
  }
  return true;
}

/** Upgrades older saves step by step; unknown versions pass through and fail validation. */
export function migrateSave(data: unknown): unknown {
  if (!isObj(data)) return data;
  let d: Record<string, unknown> = data;
  if (d.version === 1) d = { ...d, version: 2, prestige: 0, vaults: [], nano: null };
  if (d.version === 2) d = { ...d, version: 3, fog: null };
  return d;
}
