import { Application } from 'pixi.js';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import { Game } from './core/Game';
import { Ui } from './ui/Ui';
import { QUALITY_PRESETS, loadSettings } from './ui/settings';
import { createPlatformAdapter } from './platform/PlatformAdapter';
import { GAME_TITLE, CORE_COUNT, coreCountFor, worldHeightFor, DEFAULT_WORLD_WIDTH } from './config/meta';
import { biomeFor } from './rendering/biome';
import { generateMaterialsAsync } from './world/generateAsync';
import { generatorVersion } from './world/generator';
import { createSaveStore, SaveStore } from './storage/SaveStore';
import type { SaveData } from './storage/saveFormat';
import { ECHO_IDS, type UpgradeId } from './progression/upgrades';

declare global {
  interface Window {
    /** Read-only debug/test hook. */
    __game?: Game;
  }
}

const AUTOSAVE_MS = 30_000;

function urlParams(): { seed: number | null; size: number | null; echo: number } {
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get('seed')) || null;
  const raw = Number(q.get('size'));
  // Size must be a multiple of the 64-cell chunk size.
  const size = raw ? Math.min(2048, Math.max(128, Math.round(raw / 64) * 64)) : null;
  const echo = Math.min(20, Math.max(0, Math.floor(Number(q.get('echo')) || 0)));
  return { seed, size, echo };
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
  if (loaded) ui.setMenuEcho(loaded.prestige, loaded.progression.echo ?? 0);
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
    // A hidden tab keeps simulating in the background (silently); menus and the pause screen still stop it.
    const p = userPaused || blockingOverlay;
    game.setPaused(p);
    game.setBackground(document.hidden);
    game.sfx.suspend(p || document.hidden);
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

  const startGame = async (data: SaveData | null, prestige = 0, carry?: { levels: Partial<Record<UpgradeId, number>>; echo: number }): Promise<void> => {
    if (game) {
      game.destroy();
      game = null;
      window.__game = undefined;
    }
    blockingOverlay = false;
    userPaused = false;
    const url = urlParams();
    const seed = data ? data.seed : (url.seed ?? randomSeed());
    if (!data && prestige === 0) prestige = url.echo; // `?echo=N` (testing)
    if (data) prestige = data.prestige; // loaded saves keep their Echo level
    const width = data ? data.width : (url.size ?? DEFAULT_WORLD_WIDTH);
    const height = data ? data.height : (url.size ?? worldHeightFor(prestige));
    ui.showMenu(false);
    loadingTitle.textContent = 'Welt wird erzeugt…';
    loading.classList.remove('hidden');
    progress(0);
    const cores = data ? (data.cores ?? CORE_COUNT) : coreCountFor(prestige);
    // Saves from before the biome ores (generator < 3) must regenerate their untouched terrain the old way.
    const echoGen = data && data.generator < 3 ? 0 : prestige;
    const mats = await generateMaterialsAsync({ width, height, seed, cores, echo: echoGen }, (p) => progress(p * 0.9));
    const g = new Game(app, { worldWidth: width, worldHeight: height, seed, cores, carry: data ? undefined : carry, echo: echoGen, mats, particles: preset.particles, bloom: settings.quality !== 'low', detail: settings.quality === 'low' ? 2 : 4, prestige });
    if (data) {
      if (data.generator !== generatorVersion(data.prestige)) {
        ui.toast('Spielstand aus einer älteren Weltversion: Unberührte Bereiche wurden neu erzeugt.', false, 7000);
      }
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
    if (!data) ui.toast(`ZIEL: Zerstöre alle ${g.cores.length} Resonanzkerne${prestige ? ` (Echo ${prestige} · ${biomeFor(prestige).name})` : ''}. Der Scanner zeigt den Weg.`, false, 7000);
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
  // World transition: fade to black -> generate in the dark -> title card -> fade in.
  const fadeEl = document.getElementById('world-fade') as HTMLElement;
  const fadeTitle = document.getElementById('world-fade-title') as HTMLElement;
  const fadeSub = document.getElementById('world-fade-sub') as HTMLElement;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reduced ? 0 : ms));
  const fadeToBlack = async (): Promise<void> => {
    fadeEl.classList.remove('hidden', 'slow', 'title');
    void fadeEl.offsetWidth;
    fadeEl.classList.add('show');
    await wait(650);
  };
  const fadeFromBlack = async (title: string, sub: string): Promise<void> => {
    fadeTitle.textContent = title;
    fadeSub.textContent = sub;
    fadeEl.classList.add('title');
    await wait(1700);
    fadeEl.classList.add('slow');
    fadeEl.classList.remove('show', 'title');
    await wait(1050);
    fadeEl.classList.add('hidden');
  };
  ui.handlers.onNewWorld = () => {
    const next = (game?.progression.prestige ?? 0) + 1;
    const pr = game?.progression;
    const carry = pr ? { levels: Object.fromEntries(ECHO_IDS.map((id) => [id, pr.levels[id]])) as Partial<Record<UpgradeId, number>>, echo: pr.echo } : undefined;
    void (async () => {
      await fadeToBlack();
      await startGame(null, next, carry);
      const g = game as Game | null;
      await fadeFromBlack(`ECHO ${next} · ${biomeFor(next).name}`, g ? `${g.cores.length} KERNE · ${g.world.height} M TIEF` : '');
    })().catch((e) => {
      fadeEl.classList.add('hidden');
      fatal(e);
    });
  };
  ui.handlers.onEchoShop = () => {
    blockingOverlay = false;
    applyPause();
    ui.toggleUpgrades(true, 'echo');
  };
  ui.handlers.onGoalClick = () => {
    if (!game) return;
    blockingOverlay = true;
    applyPause();
    ui.showVictory(game);
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
