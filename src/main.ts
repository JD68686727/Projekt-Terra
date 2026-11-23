import { Application } from 'pixi.js';
import { Game } from './core/Game';
import { Ui } from './ui/Ui';
import { createPlatformAdapter } from './platform/BlakeridgeAdapter';
import { GAME_TITLE } from './config/meta';

declare global {
  interface Window {
    /** Read-only debug/test hook. */
    __game?: Game;
  }
}

function readParams(): { seed: number; size: number } {
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get('seed')) || 1337;
  const size = Number(q.get('size')) || 256;
  // Size must be a multiple of the 64-cell chunk size.
  const clamped = Math.min(2048, Math.max(64, Math.round(size / 64) * 64));
  return { seed, size: clamped };
}

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const root = document.getElementById('game-root')!;
  const loading = document.getElementById('loading')!;
  const fill = document.getElementById('loading-fill')!;
  const platform = createPlatformAdapter();
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
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoStart: false,
    roundPixels: true,
  });
  app.ticker.stop();
  app.canvas.tabIndex = 0;
  app.canvas.setAttribute('aria-label', GAME_TITLE);
  root.prepend(app.canvas);
  progress(0.4);

  // Yield so the loading bar paints before world generation.
  await new Promise((r) => setTimeout(r, 0));
  const { seed, size } = readParams();
  const game = new Game(app, { worldWidth: size, worldHeight: size, seed });
  window.__game = game;
  progress(1);
  loading.classList.add('hidden');

  const ui = new Ui(root);
  let started = false;
  let userPaused = false;

  const setPause = (p: boolean) => {
    userPaused = p;
    game.setPaused(p || document.hidden);
    ui.showPause(p);
    if (p) platform.gameplayStop();
    else platform.gameplayStart();
  };

  ui.onPlay(() => {
    started = true;
    platform.gameplayStart();
    app.canvas.focus({ preventScroll: true });
  });
  ui.onResume(() => setPause(false));

  window.addEventListener('keydown', (e) => {
    if (!started) return;
    if (e.code === 'Escape' || e.code === 'KeyP') setPause(!userPaused);
    if (e.code === 'F3') {
      ui.togglePerf();
      e.preventDefault();
    }
  });
  document.addEventListener('visibilitychange', () => {
    game.setPaused(userPaused || document.hidden || !started);
  });
  platform.onPause(() => setPause(true));
  platform.onResume(() => setPause(false));

  // Render the world behind the menu; simulation stays paused until Play.
  game.setPaused(true);
  game.start();
  ui.onPlay(() => game.setPaused(false));
  const uiLoop = (t: number) => {
    ui.update(game, t);
    requestAnimationFrame(uiLoop);
  };
  requestAnimationFrame(uiLoop);
}

boot().catch((err: unknown) => {
  console.error(err);
  const root = document.getElementById('game-root');
  const msg = err instanceof Error ? err.message : String(err);
  if (root) {
    root.innerHTML = `<div class="overlay"><div class="error-box"><h2>Start fehlgeschlagen</h2><p></p><p>WebGL wird benötigt. Bitte Browser aktualisieren oder Hardwarebeschleunigung aktivieren.</p></div></div>`;
    root.querySelector('p')!.textContent = msg;
  }
});
