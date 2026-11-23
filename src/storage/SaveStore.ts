import { migrateSave, validateSave, type SaveData } from './saveFormat';

export interface LoadResult {
  data: SaveData | null;
  recoveredFromBackup: boolean;
  corrupted: boolean;
}

export class SaveError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'SaveError';
  }
}

export interface SaveStore {
  readonly persistent: boolean;
  load(): Promise<LoadResult>;
  save(d: SaveData): Promise<void>;
  clear(): Promise<void>;
  hasSave(): Promise<boolean>;
}

function check(raw: unknown): SaveData | null {
  try {
    const m = migrateSave(raw);
    return validateSave(m) ? m : null;
  } catch {
    return null;
  }
}

/** Shared load semantics over raw main/backup values. */
function resolve(main: unknown, backup: unknown): LoadResult {
  const m = check(main);
  if (m) return { data: m, recoveredFromBackup: false, corrupted: false };
  const corrupted = main !== undefined && main !== null;
  const b = check(backup);
  if (b) return { data: b, recoveredFromBackup: true, corrupted };
  return { data: null, recoveredFromBackup: false, corrupted };
}

const DB_NAME = 'projekt-terra';
const STORE = 'saves';

export class IndexedDbSaveStore implements SaveStore {
  readonly persistent = true;
  constructor(private readonly db: IDBDatabase) {}

  static open(): Promise<IndexedDbSaveStore> {
    return new Promise((resolveP, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new SaveError('IndexedDB unavailable'));
        return;
      }
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (e) {
        reject(new SaveError('IndexedDB open failed', e));
        return;
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolveP(new IndexedDbSaveStore(req.result));
      req.onerror = () => reject(new SaveError('IndexedDB open failed', req.error));
      req.onblocked = () => reject(new SaveError('IndexedDB open blocked'));
    });
  }

  close(): void {
    this.db.close();
  }

  async load(): Promise<LoadResult> {
    return new Promise((res, rej) => {
      try {
        const tx = this.db.transaction(STORE, 'readonly');
        const os = tx.objectStore(STORE);
        const rm = os.get('main');
        const rb = os.get('backup');
        tx.oncomplete = () => res(resolve(rm.result, rb.result));
        tx.onerror = tx.onabort = () => rej(new SaveError('Load failed', tx.error));
      } catch (e) {
        rej(new SaveError('Load failed', e));
      }
    });
  }

  save(d: SaveData): Promise<void> {
    return new Promise((res, rej) => {
      try {
        const tx = this.db.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        const rm = os.get('main');
        rm.onsuccess = () => {
          try {
            // Only rotate a *valid* main into the backup slot, so a corrupted
            // main can never overwrite the last good backup.
            if (check(rm.result)) os.put(rm.result, 'backup');
            os.put(d, 'main');
          } catch (e) {
            try { tx.abort(); } catch { /* already finished */ }
            rej(new SaveError('Save failed', e));
          }
        };
        tx.oncomplete = () => res();
        tx.onerror = () => rej(new SaveError('Save failed', tx.error));
        tx.onabort = () => rej(new SaveError('Save aborted', tx.error));
      } catch (e) {
        rej(new SaveError('Save failed', e));
      }
    });
  }

  clear(): Promise<void> {
    return new Promise((res, rej) => {
      try {
        const tx = this.db.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        os.delete('main');
        os.delete('backup');
        tx.oncomplete = () => res();
        tx.onerror = tx.onabort = () => rej(new SaveError('Clear failed', tx.error));
      } catch (e) {
        rej(new SaveError('Clear failed', e));
      }
    });
  }

  async hasSave(): Promise<boolean> {
    return (await this.load()).data !== null;
  }
}

export class MemorySaveStore implements SaveStore {
  readonly persistent = false;
  private main: unknown;
  private backup: unknown;

  async load(): Promise<LoadResult> {
    return resolve(this.main, this.backup);
  }

  async save(d: SaveData): Promise<void> {
    if (check(this.main)) this.backup = this.main;
    this.main = typeof structuredClone === 'function' ? structuredClone(d) : d;
  }

  async clear(): Promise<void> {
    this.main = undefined;
    this.backup = undefined;
  }

  async hasSave(): Promise<boolean> {
    return (await this.load()).data !== null;
  }
}

export async function createSaveStore(): Promise<SaveStore> {
  try {
    return await IndexedDbSaveStore.open();
  } catch {
    return new MemorySaveStore();
  }
}
