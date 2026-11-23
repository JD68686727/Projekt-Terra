/**
 * Platform integration boundary. The game talks only to this interface.
 * No Blakeridge SDK specification exists yet, so only a standalone
 * implementation is provided. A real SDK adapter can be added later
 * without touching game code.
 */
export interface BlakeridgeAdapter {
  readonly name: string;
  init(): Promise<void>;
  /** Loading progress 0..1. */
  loadingProgress(p: number): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Platform requests pause/resume (e.g. overlay, ad). */
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
}

export class StandaloneAdapter implements BlakeridgeAdapter {
  readonly name = 'standalone';
  async init(): Promise<void> {}
  loadingProgress(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  onPause(): void {}
  onResume(): void {}
}

export function createPlatformAdapter(): BlakeridgeAdapter {
  return new StandaloneAdapter();
}
