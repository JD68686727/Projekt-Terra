import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { World, CHUNK_SIZE } from '../../src/world/World';
import { MATERIALS } from '../../src/world/materials';
import {
  SAVE_VERSION, applySavedChunks, decodeChunkInto, encodeChunk, migrateSave, serializeChunks, validateSave,
  type SaveData,
} from '../../src/storage/saveFormat';
import { IndexedDbSaveStore, MemorySaveStore, createSaveStore } from '../../src/storage/SaveStore';

const CELLS = CHUNK_SIZE * CHUNK_SIZE;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function makeSave(world: World, over: Partial<SaveData> = {}): SaveData {
  return {
    version: SAVE_VERSION, savedAt: 123, seed: world.seed, width: world.width, height: world.height,
    progression: { mp: 5, totalMp: 10, rf: 1, totalRf: 2, levels: { a: 1, b: 0 } },
    stats: { destroyed: 7, playTime: 12.5 },
    drone: { x: 10, y: 20 },
    emitters: [{ x: 1, y: 2 }],
    victorySeen: false,
    prestige: 0,
    vaults: [false, true],
    nano: null,
    fog: null,
    generator: 2,
    chunks: serializeChunks(world),
    ...over,
  };
}

function randomWorld(): World {
  const w = new World(128, 128, 42);
  const r = rng(1);
  for (const c of w.chunks) {
    for (let i = 0; i < CELLS; i++) {
      const m = r() < 0.3 ? 0 : 1 + Math.floor(r() * (MATERIALS.length - 1));
      c.mat[i] = m;
      c.hp[i] = MATERIALS[m].durability;
    }
    c.modified = true;
  }
  return w;
}

describe('chunk codec', () => {
  it('round trips random chunk with damaged hp', () => {
    const w = randomWorld();
    const c = w.chunks[0];
    const r = rng(9);
    for (let i = 0; i < CELLS; i++) if (c.mat[i] && r() < 0.2) c.hp[i] = 1 + Math.floor(r() * 10);
    const s = encodeChunk(c);
    expect(s.hpIdx.length).toBeGreaterThan(0);
    const t = new World(64, 64, 0).chunks[0];
    decodeChunkInto(s, t);
    expect(Array.from(t.mat)).toEqual(Array.from(c.mat));
    expect(Array.from(t.hp)).toEqual(Array.from(c.hp));
    expect(t.modified).toBe(true);
  });

  it('uniform chunks compress and long runs split at 255', () => {
    const w = new World(64, 64, 0);
    const c = w.chunks[0];
    c.mat.fill(1);
    c.hp.fill(MATERIALS[1].durability);
    const s = encodeChunk(c);
    expect(s.hpIdx.length).toBe(0);
    expect(s.mat.length).toBe(2 * Math.ceil(CELLS / 255));
    for (let i = 1; i < s.mat.length; i += 2) expect(s.mat[i]).toBeLessThanOrEqual(255);
    const t = new World(64, 64, 0).chunks[0];
    decodeChunkInto(s, t);
    expect(Array.from(t.mat)).toEqual(Array.from(c.mat));
  });

  it('all-air chunk round trips with hp 0', () => {
    const c = new World(64, 64, 0).chunks[0];
    const t = new World(64, 64, 0).chunks[0];
    t.hp.fill(5);
    decodeChunkInto(encodeChunk(c), t);
    expect(t.hp.every((v) => v === 0)).toBe(true);
  });
});

describe('world serialization', () => {
  it('serializes only modified chunks and restores exactly', () => {
    const w = randomWorld();
    for (const c of w.chunks) c.modified = false;
    w.chunks[2].modified = true;
    w.damage(5, 70, 3); // chunk index 2 (cx0, cy1)
    const saved = serializeChunks(w);
    expect(saved.map((s) => s.index)).toEqual([2]);

    const w2 = new World(128, 128, 42);
    applySavedChunks(w2, saved);
    expect(Array.from(w2.chunks[2].mat)).toEqual(Array.from(w.chunks[2].mat));
    expect(Array.from(w2.chunks[2].hp)).toEqual(Array.from(w.chunks[2].hp));
    expect(w2.takeDirty().length).toBe(w2.chunks.length);
  });
});

describe('validateSave', () => {
  const w = randomWorld();
  const base = () => makeSave(w);

  it('accepts valid', () => {
    expect(validateSave(base())).toBe(true);
    expect(validateSave(migrateSave(base()))).toBe(true);
  });

  const bad: [string, (d: any) => void][] = [
    ['wrong version', (d) => { d.version = 3; }],
    ['newer version', (d) => { d.version = 99; }],
    ['bad RLE sum', (d) => { d.chunks[0].mat = Uint8Array.from([1, 10]); }],
    ['zero run', (d) => { d.chunks[0].mat = Uint8Array.from([1, 0, 1, 255]); }],
    ['odd RLE length', (d) => { d.chunks[0].mat = Uint8Array.from([1, 255, 1]); }],
    ['unknown material', (d) => { d.chunks[0].mat = Uint8Array.from([200, 255]); }],
    ['OOB index', (d) => { d.chunks[0].index = 4; }],
    ['negative index', (d) => { d.chunks[0].index = -1; }],
    ['duplicate index', (d) => { d.chunks[1].index = d.chunks[0].index; }],
    ['NaN mp', (d) => { d.progression.mp = NaN; }],
    ['Infinity rf', (d) => { d.progression.rf = Infinity; }],
    ['bad width', (d) => { d.width = 100; }],
    ['zero height', (d) => { d.height = 0; }],
    ['too large', (d) => { d.width = 8192 + 64; }],
    ['fractional level', (d) => { d.progression.levels.a = 1.5; }],
    ['negative level', (d) => { d.progression.levels.a = -1; }],
    ['hpIdx OOB', (d) => { d.chunks[0].hpIdx = Uint16Array.from([4096]); d.chunks[0].hpVal = Uint16Array.from([1]); }],
    ['hp length mismatch', (d) => { d.chunks[0].hpIdx = Uint16Array.from([1]); d.chunks[0].hpVal = new Uint16Array(0); }],
    ['emitter NaN', (d) => { d.emitters = [{ x: NaN, y: 0 }]; }],
    ['drone missing', (d) => { delete d.drone; }],
    ['victorySeen not boolean', (d) => { d.victorySeen = 1; }],
    ['chunks not array', (d) => { d.chunks = {}; }],
    ['plain array mat', (d) => { d.chunks[0].mat = [1, 255]; }],
  ];
  for (const [name, mut] of bad) {
    it(`rejects ${name}`, () => {
      const d: any = base();
      mut(d);
      expect(validateSave(d)).toBe(false);
    });
  }
  it('rejects non-objects', () => {
    for (const v of [null, undefined, 5, 'x', [], true]) expect(validateSave(v)).toBe(false);
  });
});

describe('IndexedDbSaveStore', () => {
  const w = new World(64, 64, 3);
  w.setMat(1, 1, 1);
  const mk = (n: number) => makeSave(w, { savedAt: n });

  async function fresh() {
    const s = await IndexedDbSaveStore.open();
    await s.clear();
    return s;
  }

  it('round trips and reports persistent', async () => {
    const s = await fresh();
    expect(s.persistent).toBe(true);
    expect(await s.hasSave()).toBe(false);
    expect((await s.load()).data).toBeNull();
    await s.save(mk(1));
    const r = await s.load();
    expect(r.data?.savedAt).toBe(1);
    expect(r.recoveredFromBackup).toBe(false);
    expect(r.corrupted).toBe(false);
    expect(r.data!.chunks[0].mat).toBeInstanceOf(Uint8Array);
    expect(await s.hasSave()).toBe(true);
  });

  it('rotates backup and recovers from corrupted main', async () => {
    const s = await fresh();
    await s.save(mk(1));
    await s.save(mk(2));
    await rawPut(s, 'main', { garbage: true });
    const r = await s.load();
    expect(r.data?.savedAt).toBe(1);
    expect(r.recoveredFromBackup).toBe(true);
    expect(r.corrupted).toBe(true);
    expect(await s.hasSave()).toBe(true);
  });

  it('backup holds previous main after second save', async () => {
    const s = await fresh();
    await s.save(mk(1));
    await s.save(mk(2));
    expect((await s.load()).data?.savedAt).toBe(2);
    await rawPut(s, 'main', 'bad');
    expect((await s.load()).data?.savedAt).toBe(1);
  });

  it('both corrupt gives null', async () => {
    const s = await fresh();
    await rawPut(s, 'main', { x: 1 });
    await rawPut(s, 'backup', 'nope');
    const r = await s.load();
    expect(r.data).toBeNull();
    expect(r.corrupted).toBe(true);
    expect(await s.hasSave()).toBe(false);
  });

  it('clear removes both', async () => {
    const s = await fresh();
    await s.save(mk(1));
    await s.save(mk(2));
    await s.clear();
    expect(await s.hasSave()).toBe(false);
    expect((await s.load()).corrupted).toBe(false);
  });

  it('createSaveStore returns IndexedDB store here', async () => {
    expect((await createSaveStore()).persistent).toBe(true);
  });
});

describe('MemorySaveStore', () => {
  it('has same semantics', async () => {
    const w = new World(64, 64, 3);
    const s = new MemorySaveStore();
    expect(s.persistent).toBe(false);
    expect((await s.load()).data).toBeNull();
    await s.save(makeSave(w, { savedAt: 1 }));
    await s.save(makeSave(w, { savedAt: 2 }));
    expect((await s.load()).data?.savedAt).toBe(2);
    (s as any).main = { bad: 1 };
    const r = await s.load();
    expect(r.data?.savedAt).toBe(1);
    expect(r.recoveredFromBackup && r.corrupted).toBe(true);
    await s.clear();
    expect(await s.hasSave()).toBe(false);
  });
});

function rawPut(s: IndexedDbSaveStore, key: string, value: unknown): Promise<void> {
  const db = (s as any).db as IDBDatabase;
  return new Promise((res, rej) => {
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

describe('backup safety (lead review)', () => {
  it('a corrupted main never overwrites a good backup', async () => {
    const store = new MemorySaveStore();
    const good = makeSave(new World(64, 64, 1));
    await store.save(good);
    await store.save({ ...good, savedAt: good.savedAt + 1 }); // backup = good
    // Corrupt main directly, then save again: the corrupt main must not become the backup.
    (store as unknown as { main: unknown }).main = { version: 1, broken: true };
    await store.save({ ...good, savedAt: good.savedAt + 2 });
    (store as unknown as { main: unknown }).main = { version: 1, broken: true };
    const r = await store.load();
    expect(r.recoveredFromBackup).toBe(true);
    expect(r.data).not.toBeNull();
  });
});

describe('save migration v1 → v2', () => {
  it('upgrades a v1 save with defaults and validates', () => {
    const w = new World(64, 64, 3);
    const v2 = makeSave(w);
    const { prestige: _p, vaults: _v, nano: _n, fog: _f, generator: _g, ...rest } = v2;
    const v1 = { ...rest, version: 1 };
    expect(validateSave(v1)).toBe(false);
    const m = migrateSave(v1);
    expect(validateSave(m)).toBe(true);
    expect((m as SaveData).prestige).toBe(0);
    expect((m as SaveData).vaults).toEqual([]);
    expect((m as SaveData).nano).toBeNull();
  });
  it('rejects bad v2 fields', () => {
    const w = new World(64, 64, 3);
    expect(validateSave(makeSave(w, { prestige: -1 }))).toBe(false);
    expect(validateSave(makeSave(w, { prestige: 1.5 }))).toBe(false);
    expect(validateSave(makeSave(w, { nano: { x: NaN, y: 1 } }))).toBe(false);
  });
});

describe('save migration v2 → v3 (fog)', () => {
  it('adds fog: null to v2 saves and validates fog RLE size', () => {
    const w = new World(64, 64, 3);
    const v3 = makeSave(w);
    const { fog: _f, generator: _g, ...rest } = v3;
    const v2 = { ...rest, version: 2 };
    expect(validateSave(v2)).toBe(false);
    const m = migrateSave(v2) as SaveData;
    expect(validateSave(m)).toBe(true);
    expect(m.fog).toBeNull();
    expect(validateSave(makeSave(w, { fog: Uint8Array.from([0, 255, 0, 1]) }))).toBe(true); // 16×16 = 256
    expect(validateSave(makeSave(w, { fog: Uint8Array.from([0, 200]) }))).toBe(false);
  });
});
