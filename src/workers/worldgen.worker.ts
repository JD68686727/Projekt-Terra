/// <reference lib="webworker" />
import { generateMaterials, WorldSpec } from '../world/generator';

// Generates terrain off the main thread and transfers the buffer back.
self.onmessage = (e: MessageEvent<WorldSpec>) => {
  try {
    const mats = generateMaterials(e.data, (p: number) => self.postMessage({ type: "progress", p }));
    self.postMessage({ type: 'done', mats }, [mats.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
