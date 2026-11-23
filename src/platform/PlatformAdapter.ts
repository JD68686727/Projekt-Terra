/**
 * Platform integration boundary. The game talks only to this interface.
 * No PlayGrid SDK specification exists yet, so only a standalone
 * implementation is provided. A real SDK adapter can be added later
 * without touching game code.
 */
export interface PlatformAdapter {
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

export class StandaloneAdapter implements PlatformAdapter {
  readonly name = 'standalone';
  async init(): Promise<void> {}
  loadingProgress(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  onPause(): void {}
  onResume(): void {}
}

export function createPlatformAdapter(): PlatformAdapter {
  return new StandaloneAdapter();
}
