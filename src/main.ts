import { Application } from 'pixi.js';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import { Game } from './core/Game';
import { Ui } from './ui/Ui';
import { QUALITY_PRESETS, loadSettings } from './ui/settings';
import { createPlatformAdapter } from './platform/BlakeridgeAdapter';
import { GAME_TITLE, CORE_COUNT, DEFAULT_WORLD_WIDTH, DEFAULT_WORLD_HEIGHT } from './config/meta';
import { generateMaterialsAsync } from './world/generateAsync';
import { createSaveStore, SaveStore } from './storage/SaveStore';
import type { SaveData } from './storage/saveFormat';

declare global {
  interface Window {
    /** Read-only debug/test hook. */
    __game?: Game;
  }
}

const AUTOSAVE_MS = 30_000;

function urlParams(): { seed: number | null; size: number | null } {
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get('seed')) || null;
  const raw = Number(q.get('size'));
  // Size must be a multiple of the 64-cell chunk size.
  const size = raw ? Math.min(2048, Math.max(128, Math.round(raw / 64) * 64)) : null;
  return { seed, size };
}

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  } catch {
    return (Math.random() * 0xffffffff) >>> 0 || 1;
  }
}

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const root = document.getElementById('game-root')!;
  const loading = document.getElementById('loading')!;
  const loadingTitle = loading.querySelector('.loading-title')!;
  const fill = document.getElementById('loading-fill')!;
  const platform = createPlatformAdapter();
  const settings = loadSettings();
  const preset = QUALITY_PRESETS[settings.quality];
  const progress = (p: number) => {
    fill.style.width = `${Math.round(p * 100)}%`;
    platform.loadingProgress(p);
  };

  await platform.init();
  progress(0.1);

  const app = new Application();
  await app.init({
    resizeTo: root,
    preference: 'webgl',
    background: 0x070a14,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, preset.dprCap),
    autoStart: false,
    roundPixels: true,
  });
  app.ticker.stop();
  app.canvas.tabIndex = 0;
  app.canvas.setAttribute('aria-label', GAME_TITLE);
  root.prepend(app.canvas);
  progress(0.3);

  const store: SaveStore = await createSaveStore();
  let loaded: SaveData | null = null;
  const ui = new Ui(root, settings);
  try {
    const r = await store.load();
    loaded = r.data;
    if (r.corrupted && r.recoveredFromBackup) ui.toast('Spielstand war beschädigt – letzte Sicherung geladen.', true, 6000);
    else if (r.corrupted) ui.toast('Spielstand war beschädigt und konnte nicht geladen werden.', true, 6000);
  } catch (e) {
    console.error(e);
    ui.toast('Spielstand konnte nicht gelesen werden.', true, 6000);
  }
  if (!store.persistent) {
    ui.toast('Speichern nicht verfügbar (Browser blockiert lokalen Speicher). Fortschritt geht beim Schließen verloren.', true, 8000);
  }

  progress(1);
  loading.classList.add('hidden');
  ui.showMenu(true, loaded !== null);

  let game: Game | null = null;
  let userPaused = false;
  let saving = false;
  let blockingOverlay = false; // victory screen

  const save = async (manual: boolean): Promise<void> => {
    if (!game || saving) return;
    saving = true;
    try {
      await store.save(game.toSave());
      if (manual) ui.toast('Spiel gespeichert.');
    } catch (e) {
      console.error(e);
      ui.toast(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, true, 6000);
    } finally {
      saving = false;
    }
  };

  const applyPause = () => {
    if (!game) return;
    const p = userPaused || blockingOverlay || document.hidden;
    game.setPaused(p);
    game.sfx.suspend(p);
  };

  const setUserPause = (p: boolean) => {
    if (!game) return;
    userPaused = p;
    ui.showPause(p);
    applyPause();
    if (p) {
      platform.gameplayStop();
      void save(false);
    } else {
      platform.gameplayStart();
    }
  };

  const startGame = async (data: SaveData | null, prestige = 0): Promise<void> => {
    if (game) {
      game.destroy();
      game = null;
      window.__game = undefined;
    }
    blockingOverlay = false;
    userPaused = false;
    const url = urlParams();
    const seed = data ? data.seed : (url.seed ?? randomSeed());
    const width = data ? data.width : (url.size ?? DEFAULT_WORLD_WIDTH);
    const height = data ? data.height : url.size ?? DEFAULT_WORLD_HEIGHT;
    ui.showMenu(false);
    loadingTitle.textContent = 'Welt wird erzeugt…';
    loading.classList.remove('hidden');
    progress(0);
    const mats = await generateMaterialsAsync({ width, height, seed, cores: CORE_COUNT }, (p) => progress(p * 0.9));
    const g = new Game(app, { worldWidth: width, worldHeight: height, seed, cores: CORE_COUNT, mats, particles: preset.particles, bloom: settings.quality !== 'low', detail: settings.quality === 'low' ? 2 : 4, prestige });
    if (data) {
      try {
        g.applySave(data);
      } catch (e) {
        console.error(e);
        ui.toast('Spielstand konnte nicht angewendet werden.', true, 6000);
      }
    }
    game = g;
    window.__game = g;
    ui.bind(g);
    g.sfx.unlock();
    g.sfx.setVolume(settings.volume);
    if (settings.muted && !g.sfx.muted) ui.toggleMute();
    g.onCoreDestroyed = (_i, done) => {
      if (done < g.cores.length) ui.toast(`Resonanzkern ${done}/${g.cores.length} zerstört! Der Scanner zeigt den nächsten.`, false, 5000);
    };
    g.onVault = (rf, mp) => ui.toast(`Geheimkammer entdeckt! +${rf} RF, +${mp.toLocaleString('de-DE')} MP`, false, 5000);
    g.onVictory = () => {
      blockingOverlay = true;
      applyPause();
      void save(false);
      ui.showVictory(g);
    };
    progress(1);
    loading.classList.add('hidden');
    g.start();
    applyPause();
    platform.gameplayStart();
    app.canvas.focus({ preventScroll: true });
    void save(false);
  };

  ui.handlers.onNewGame = () => void startGame(null).catch(fatal);
  ui.handlers.onContinue = () => void startGame(loaded).catch(fatal);
  ui.handlers.onResume = () => setUserPause(false);
  ui.handlers.onSave = () => void save(true);
  ui.handlers.onReset = () => {
    void (async () => {
      try {
        await store.clear();
      } catch (e) {
        ui.toast(`Löschen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, true, 6000);
        return;
      }
      game?.stop();
      location.reload();
    })();
  };
  ui.handlers.onNewWorld = () => {
    const next = (game?.progression.prestige ?? 0) + 1;
    void startGame(null, next).catch(fatal);
  };
  ui.handlers.onVictoryClose = () => {
    blockingOverlay = false;
    applyPause();
  };

  window.addEventListener('keydown', (e) => {
    if (!game || blockingOverlay) return;
    if (e.code === 'Escape' || e.code === 'KeyP') setUserPause(!userPaused);
    if (userPaused) return;
    if (e.code === 'KeyU') ui.toggleUpgrades();
    if (e.code === 'KeyM') ui.toggleMute();
    if (e.code === 'F3') {
      ui.togglePerf();
      e.preventDefault();
    }
  });
  document.addEventListener('visibilitychange', () => {
    applyPause();
    if (document.hidden) void save(false);
  });
  window.addEventListener('pagehide', () => void save(false));
  window.setInterval(() => {
    if (game && !game.paused) void save(false);
  }, AUTOSAVE_MS);
  platform.onPause(() => setUserPause(true));
  platform.onResume(() => setUserPause(false));

  const uiLoop = (t: number) => {
    if (game) ui.update(game, t);
    requestAnimationFrame(uiLoop);
  };
  requestAnimationFrame(uiLoop);
}

function fatal(err: unknown): void {
  console.error(err);
  const root = document.getElementById('game-root');
  const msg = err instanceof Error ? err.message : String(err);
  if (root) {
    root.innerHTML =
      '<div class="overlay"><div class="error-box"><h2>Start fehlgeschlagen</h2><p></p>' +
      '<p>WebGL wird benötigt. Bitte Browser aktualisieren oder Hardwarebeschleunigung aktivieren.</p></div></div>';
    root.querySelector('p')!.textContent = msg;
  }
}

boot().catch(fatal);
