import { generateMaterials, WorldSpec } from './generator';

/**
 * Generates terrain in a Web Worker; falls back to the main thread if
 * workers are unavailable (e.g. blocked by CSP) or fail.
 */
export function generateMaterialsAsync(spec: WorldSpec, onProgress: (p: number) => void): Promise<Uint8Array> {
  return new Promise((resolve) => {
    let worker: Worker;
    const fallback = () => {
      resolve(generateMaterials(spec, onProgress));
    };
    try {
      worker = new Worker(new URL('../workers/worldgen.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      fallback();
      return;
    }
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data as { type: string; p?: number; mats?: Uint8Array; message?: string };
      if (d.type === 'progress') onProgress(d.p ?? 0);
      else if (d.type === 'done' && d.mats) {
        worker.terminate();
        resolve(d.mats);
      } else if (d.type === 'error') {
        console.warn('World generation worker failed, using main thread:', d.message);
        worker.terminate();
        fallback();
      }
    };
    worker.onerror = (ev) => {
      ev.preventDefault();
      console.warn('World generation worker error, using main thread');
      worker.terminate();
      fallback();
    };
    worker.postMessage(spec);
  });
}
