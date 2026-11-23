import { GAME_SUBTITLE, GAME_TITLE, GAME_VERSION } from '../config/meta';
import type { Game, WeaponId } from '../core/Game';
import { UPGRADES, UpgradeGroup, UpgradeId } from '../progression/upgrades';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmt = (n: number) => Math.floor(n).toLocaleString('de-DE');
const GROUP_LABEL: Record<UpgradeGroup, string> = { laser: 'SCHNEIDLASER', pulse: 'PULSE CANNON', core: 'SYSTEME' };

interface UpgradeRow {
  id: UpgradeId;
  root: HTMLElement;
  level: HTMLElement;
  cost: HTMLButtonElement;
}

/** DOM overlay UI: menus, HUD, weapon bar, upgrade panel, perf overlay. */
export class Ui {
  private readonly root: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly perf: HTMLElement;
  private readonly mpEl: HTMLElement;
  private readonly infoEl: HTMLElement;
  private readonly weaponBar: HTMLElement;
  private readonly weaponBtns = new Map<WeaponId, HTMLButtonElement>();
  private readonly pulseCd: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly rows: UpgradeRow[] = [];
  private readonly muteBtn: HTMLButtonElement;
  private perfVisible = false;
  private lastHud = 0;
  private game: Game | null = null;

  constructor(root: HTMLElement) {
    this.root = root;

    // Main menu
    this.menu = el('div', 'overlay');
    this.menu.id = 'main-menu';
    const m = el('div', 'menu');
    m.append(el('h1', undefined, GAME_TITLE), el('div', 'subtitle', GAME_SUBTITLE.toUpperCase()));
    const play = el('button', 'btn', 'SPIELEN');
    play.id = 'btn-play';
    m.append(play);
    const hint = el('div', 'hint');
    hint.innerHTML =
      'WASD / Pfeiltasten: Drohne steuern · Maus / Leertaste: Feuern<br>' +
      '1 / 2 / Q: Waffe · U: Upgrades · Mausrad: Zoom<br>Esc: Pause · M: Ton · F3: Performance';
    m.append(hint, el('div', 'hint', `v${GAME_VERSION}`));
    this.menu.append(m);

    // Pause menu with settings
    this.pause = el('div', 'overlay hidden');
    this.pause.id = 'pause-menu';
    const p = el('div', 'menu');
    p.append(el('h1', undefined, 'PAUSE'), el('div', 'subtitle', ' '));
    const resume = el('button', 'btn', 'WEITER');
    resume.id = 'btn-resume';
    const vol = el('label', 'setting');
    vol.append(el('span', undefined, 'LAUTSTÄRKE '));
    const range = el('input');
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.value = '50';
    range.id = 'volume';
    range.addEventListener('input', () => this.game?.sfx.setVolume(Number(range.value) / 100));
    vol.append(range);
    p.append(resume, el('div'), vol);
    this.pause.append(p);

    // HUD
    this.hud = el('div', 'hud hidden');
    const panel = el('div', 'hud-panel');
    this.mpEl = el('div', 'hud-mp', '0 MP');
    this.mpEl.id = 'hud-mp';
    this.infoEl = el('div', 'hud-info');
    panel.append(el('div', 'hud-label', 'MATERIAL POINTS'), this.mpEl, this.infoEl);
    this.hud.append(panel);

    // Weapon bar
    this.weaponBar = el('div', 'weapon-bar hidden');
    for (const [id, label] of [['laser', '1 LASER'], ['pulse', '2 PULSE']] as const) {
      const b = el('button', 'weapon-btn', label);
      b.id = `weapon-${id}`;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (!this.game?.selectWeapon(id)) this.game?.sfx.denied();
      });
      this.weaponBtns.set(id, b);
      this.weaponBar.append(b);
    }
    this.pulseCd = el('div', 'cooldown');
    this.weaponBtns.get('pulse')!.append(this.pulseCd);
    const upBtn = el('button', 'weapon-btn upgrade-toggle', 'U UPGRADES');
    upBtn.id = 'btn-upgrades';
    upBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleUpgrades();
    });
    this.muteBtn = el('button', 'weapon-btn', '♪');
    this.muteBtn.title = 'Ton an/aus (M)';
    this.muteBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleMute();
    });
    this.weaponBar.append(upBtn, this.muteBtn);

    // Upgrade panel
    this.panel = el('div', 'upgrade-panel hidden');
    this.panel.id = 'upgrade-panel';
    const head = el('div', 'panel-head');
    head.append(el('span', undefined, 'UPGRADES'));
    const close = el('button', 'panel-close', '×');
    close.addEventListener('click', () => this.toggleUpgrades(false));
    head.append(close);
    this.panel.append(head);
    let group: UpgradeGroup | null = null;
    for (const u of UPGRADES) {
      if (u.group !== group) {
        group = u.group;
        this.panel.append(el('div', 'panel-group', GROUP_LABEL[group]));
      }
      const row = el('div', 'upgrade-row');
      row.dataset.id = u.id;
      const info = el('div', 'upgrade-info');
      const name = el('div', 'upgrade-name', u.name);
      const level = el('span', 'upgrade-level');
      name.append(level);
      info.append(name, el('div', 'upgrade-desc', u.desc));
      const cost = el('button', 'upgrade-buy');
      cost.id = `buy-${u.id}`;
      cost.addEventListener('click', () => this.buy(u.id));
      row.append(info, cost);
      this.panel.append(row);
      this.rows.push({ id: u.id, root: row, level, cost });
    }
    // Keep panel interactions from reaching the game canvas.
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    this.perf = el('div', 'perf hidden');
    this.perf.id = 'perf';

    root.append(this.hud, this.weaponBar, this.panel, this.perf, this.pause, this.menu);
  }

  bind(game: Game): void {
    this.game = game;
  }

  onPlay(cb: () => void): void {
    this.root.querySelector<HTMLButtonElement>('#btn-play')!.addEventListener('click', () => {
      this.menu.classList.add('hidden');
      this.hud.classList.remove('hidden');
      this.weaponBar.classList.remove('hidden');
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

  toggleUpgrades(force?: boolean): void {
    const show = force ?? this.panel.classList.contains('hidden');
    this.panel.classList.toggle('hidden', !show);
    this.lastHud = 0;
  }

  toggleMute(): void {
    if (!this.game) return;
    const muted = this.game.sfx.toggleMute();
    this.muteBtn.classList.toggle('off', muted);
  }

  private buy(id: UpgradeId): void {
    const g = this.game;
    if (!g) return;
    if (g.progression.buy(id) === 'ok') g.sfx.purchase();
    else g.sfx.denied();
    this.lastHud = 0;
  }

  /** Throttled DOM updates (≈10 Hz) to avoid layout cost every frame. */
  update(game: Game, now: number): void {
    if (now - this.lastHud < 100) return;
    this.lastHud = now;
    const pr = game.progression;
    this.mpEl.textContent = `${fmt(pr.mp)} MP`;
    const depth = Math.max(0, Math.floor(game.drone.y - game.world.height * 0.2));
    this.infoEl.textContent = `Zerstört: ${fmt(game.stats.destroyed)} · Tiefe: ${depth} m`;

    for (const [id, b] of this.weaponBtns) {
      b.classList.toggle('active', game.weapon === id);
      if (id === 'pulse') b.classList.toggle('locked', !pr.pulseUnlocked());
    }
    const cd = game.pulse.cooldownLeft / game.pulse.stats.cooldown;
    this.pulseCd.style.width = `${Math.round(Math.max(0, cd) * 100)}%`;

    // Count affordable upgrades for the toggle badge.
    let affordable = 0;
    const panelOpen = !this.panel.classList.contains('hidden');
    for (const r of this.rows) {
      const state = pr.check(r.id);
      if (state === 'ok') affordable++;
      if (!panelOpen) continue;
      const lvl = pr.level(r.id);
      r.level.textContent = ` ${lvl}`;
      r.root.classList.toggle('hidden', state === 'locked');
      r.cost.disabled = state !== 'ok';
      r.cost.textContent = state === 'maxed' ? 'MAX' : `${fmt(pr.cost(r.id))} MP`;
    }
    this.root.querySelector('#btn-upgrades')!.classList.toggle('glow', affordable > 0);

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
}
