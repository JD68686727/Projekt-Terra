// Single source of truth for the (working) game title. Rename here only.
export const GAME_TITLE = 'PROJEKT TERRA';
export const GAME_SUBTITLE = 'Fracture the World';
export const GAME_VERSION = '0.9.0';

/** Default world size for a new game (cells). */
export const DEFAULT_WORLD_WIDTH = 1024;
export const DEFAULT_WORLD_HEIGHT = 2048;
/** Hidden resonance cores; destroying all of them ends the game. */
export const CORE_COUNT = 3;
/** Upper bound of cores in later Echo worlds. */
export const MAX_CORES = 6;
/** Cores of a new world: each Echo adds one more core (capped). */
export function coreCountFor(prestige: number): number {
  return Math.min(MAX_CORES, CORE_COUNT + Math.max(0, prestige));
}
