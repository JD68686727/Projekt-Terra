import { GAME_SUBTITLE, GAME_TITLE, GAME_VERSION } from '../config/meta';
import type { Game } from '../core/Game';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** DOM overlay UI: main menu, pause menu, HUD and perf overlay. */
export class Ui {
  private readonly root: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly perf: HTMLElement;
  private readonly mpEl: HTMLElement;
  private readonly infoEl: HTMLElement;
  private perfVisible = false;
  private lastHud = 0;

  constructor(root: HTMLElement) {
    this.root = root;

    this.menu = el('div', 'overlay');
    this.menu.id = 'main-menu';
    const m = el('div', 'menu');
    m.append(el('h1', undefined, GAME_TITLE), el('div', 'subtitle', GAME_SUBTITLE.toUpperCase()));
    const play = el('button', 'btn', 'SPIELEN');
    play.id = 'btn-play';
    m.append(play);
    const hint = el('div', 'hint');
    hint.innerHTML = 'WASD / Pfeiltasten: Drohne steuern<br>Linke Maustaste / Leertaste: Laser<br>Mausrad / + −: Zoom · Esc: Pause · F3: Performance';
    m.append(hint, el('div', 'hint', `v${GAME_VERSION}`));
    this.menu.append(m);

    this.pause = el('div', 'overlay hidden');
    this.pause.id = 'pause-menu';
    const p = el('div', 'menu');
    p.append(el('h1', undefined, 'PAUSE'));
    const resume = el('button', 'btn', 'WEITER');
    resume.id = 'btn-resume';
    p.append(el('div', 'subtitle', ' '), resume);
    this.pause.append(p);

    this.hud = el('div', 'hud hidden');
    const panel = el('div', 'hud-panel');
    this.mpEl = el('div', 'hud-mp', '0 MP');
    this.mpEl.id = 'hud-mp';
    this.infoEl = el('div');
    panel.append(el('div', 'hud-label', 'MATERIAL POINTS'), this.mpEl, this.infoEl);
    this.hud.append(panel);

    this.perf = el('div', 'perf hidden');
    this.perf.id = 'perf';

    root.append(this.hud, this.perf, this.pause, this.menu);
  }

  onPlay(cb: () => void): void {
    this.root.querySelector<HTMLButtonElement>('#btn-play')!.addEventListener('click', () => {
      this.menu.classList.add('hidden');
      this.hud.classList.remove('hidden');
      cb();
    });
  }

  onResume(cb: () => void): void {
    this.root.querySelector<HTMLButtonElement>('#btn-resume')!.addEventListener('click', cb);
  }

  showPause(show: boolean): void {
    this.pause.classList.toggle('hidden', !show);
  }

  togglePerf(): void {
    this.perfVisible = !this.perfVisible;
    this.perf.classList.toggle('hidden', !this.perfVisible);
  }

  /** Throttled DOM updates (≈10 Hz) to avoid layout cost every frame. */
  update(game: Game, now: number): void {
    if (now - this.lastHud < 100) return;
    this.lastHud = now;
    const s = game.stats;
    this.mpEl.textContent = `${Math.floor(s.mp).toLocaleString('de-DE')} MP`;
    const depth = Math.max(0, Math.floor(game.drone.y - game.world.height * 0.2));
    this.infoEl.textContent = `Zerstört: ${s.destroyed.toLocaleString('de-DE')} · Tiefe: ${depth} m`;
    if (this.perfVisible) {
      const p = game.perf;
      this.perf.textContent =
        `FPS      ${p.fps.toFixed(0)}\n` +
        `frame    ${p.frameMs.toFixed(2)} ms\n` +
        `sim      ${p.simMs.toFixed(2)} ms (${p.steps} st)\n` +
        `terrain  ${p.terrainMs.toFixed(2)} ms\n` +
        `render   ${p.renderMs.toFixed(2)} ms\n` +
        `uploads  ${p.uploads} ch / ${p.texels} tx\n` +
        `chunks   ${p.visibleChunks} vis\n` +
        `particles ${p.particles}`;
    }
  }

  showError(message: string): void {
    const o = el('div', 'overlay');
    const b = el('div', 'error-box');
    b.append(el('h2', undefined, 'Fehler'), el('p', undefined, message));
    o.append(b);
    this.root.append(o);
  }
}
