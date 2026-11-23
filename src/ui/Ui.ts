import { GAME_SUBTITLE, GAME_TITLE, GAME_VERSION } from '../config/meta';
import type { Game, WeaponId } from '../core/Game';
import { UPGRADES, UpgradeGroup, UpgradeId } from '../progression/upgrades';
import { QUALITY_PRESETS, Quality, Settings, saveSettings } from './settings';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmt = (n: number) => Math.floor(n).toLocaleString('de-DE');
const GROUP_LABEL: Record<UpgradeGroup, string> = { laser: 'SCHNEIDLASER', pulse: 'PULSE CANNON', resonance: 'RESONANZ', auto: 'AUTOMATION', core: 'SYSTEME' };

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
  private readonly rfEl: HTMLElement;
  private readonly weaponBar: HTMLElement;
  private readonly weaponBtns = new Map<WeaponId, HTMLButtonElement>();
  private readonly pulseCd: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly rows: UpgradeRow[] = [];
  private readonly muteBtn: HTMLButtonElement;
  private perfVisible = false;
  private lastHud = 0;
  private game: Game | null = null;
  private readonly settings: Settings;
  private readonly settingsEl: HTMLElement;
  private readonly confirmEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly victoryEl: HTMLElement;
  private readonly scanEl: HTMLElement;
  private readonly coreBar: HTMLElement;
  private toastTimer = 0;
  /** Handlers wired by main.ts. */
  handlers = {
    onContinue: () => {},
    onNewGame: () => {},
    onResume: () => {},
    onSave: () => {},
    onReset: () => {},
    onVictoryClose: () => {},
  };

  constructor(root: HTMLElement, settings: Settings) {
    this.root = root;
    this.settings = settings;

    // Main menu
    this.menu = el('div', 'overlay');
    this.menu.id = 'main-menu';
    const m = el('div', 'menu');
    m.append(el('h1', undefined, GAME_TITLE), el('div', 'subtitle', GAME_SUBTITLE.toUpperCase()));
    const cont = el('button', 'btn hidden', 'FORTSETZEN');
    cont.id = 'btn-continue';
    cont.addEventListener('click', () => this.handlers.onContinue());
    const play = el('button', 'btn', 'SPIELEN');
    play.id = 'btn-play';
    play.addEventListener('click', () => {
      if (cont.classList.contains('hidden')) this.handlers.onNewGame();
      else this.confirm('Neues Spiel starten? Der bisherige Spielstand wird überschrieben.', () => this.handlers.onNewGame());
    });
    const set = el('button', 'btn', 'EINSTELLUNGEN');
    set.id = 'btn-settings';
    set.addEventListener('click', () => this.showSettings(true));
    const col = el('div', 'menu-buttons');
    col.append(cont, play, set);
    m.append(col);
    const hint = el('div', 'hint');
    hint.innerHTML =
      'WASD / Pfeiltasten: Drohne steuern · Maus / Leertaste: Feuern<br>' +
      '1 / 2 / Q: Waffe · U: Upgrades · T: Auto-Laser · E: Emitter<br>Mausrad: Zoom · Esc: Pause · M: Ton · F3: Performance<br>' +
      '<span style="color:#29d8f0">Laser auf Kristalle → Kettenreaktion → Resonance Fragments</span>';
    m.append(hint, el('div', 'hint', `v${GAME_VERSION}`));
    this.menu.append(m);

    // Pause menu with settings
    this.pause = el('div', 'overlay hidden');
    this.pause.id = 'pause-menu';
    const p = el('div', 'menu');
    p.append(el('h1', undefined, 'PAUSE'), el('div', 'subtitle', ' '));
    const resume = el('button', 'btn', 'WEITER');
    resume.id = 'btn-resume';
    resume.addEventListener('click', () => this.handlers.onResume());
    const save = el('button', 'btn', 'SPEICHERN');
    save.id = 'btn-save';
    save.addEventListener('click', () => this.handlers.onSave());
    const pset = el('button', 'btn', 'EINSTELLUNGEN');
    pset.addEventListener('click', () => this.showSettings(true));
    const reset = el('button', 'btn btn-danger', 'FORTSCHRITT LÖSCHEN');
    reset.id = 'btn-reset';
    reset.addEventListener('click', () =>
      this.confirm('Gesamten Fortschritt unwiderruflich löschen?', () => this.handlers.onReset()),
    );
    const pcol = el('div', 'menu-buttons');
    pcol.append(resume, save, pset, reset);
    p.append(pcol);
    this.pause.append(p);

    // Settings
    this.settingsEl = el('div', 'overlay hidden');
    this.settingsEl.id = 'settings';
    const sm = el('div', 'menu');
    sm.append(el('h1', undefined, 'EINSTELLUNGEN'), el('div', 'subtitle', ' '));
    const vol = el('label', 'setting');
    vol.append(el('span', undefined, 'LAUTSTÄRKE'));
    const range = el('input');
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.value = String(Math.round(settings.volume * 100));
    range.id = 'volume';
    range.addEventListener('input', () => {
      settings.volume = Number(range.value) / 100;
      this.game?.sfx.setVolume(settings.volume);
      saveSettings(settings);
    });
    vol.append(range);
    const q = el('div', 'setting');
    q.append(el('span', undefined, 'GRAFIK'));
    for (const key of Object.keys(QUALITY_PRESETS) as Quality[]) {
      const b = el('button', 'chip', QUALITY_PRESETS[key].label);
      b.dataset.q = key;
      b.classList.toggle('active', settings.quality === key);
      b.addEventListener('click', () => {
        settings.quality = key;
        saveSettings(settings);
        q.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', (c as HTMLElement).dataset.q === key));
        this.toast('Grafikqualität gilt ab dem nächsten Laden des Spiels.');
      });
      q.append(b);
    }
    const back = el('button', 'btn', 'ZURÜCK');
    back.addEventListener('click', () => this.showSettings(false));
    const scol = el('div', 'menu-buttons');
    scol.append(vol, q, back);
    sm.append(scol);
    this.settingsEl.append(sm);

    // Confirm dialog
    this.confirmEl = el('div', 'overlay hidden');
    this.confirmEl.id = 'confirm';
    this.confirmEl.style.zIndex = '30';

    // Victory
    this.victoryEl = el('div', 'overlay hidden');
    this.victoryEl.id = 'victory';

    // Toast
    this.toastEl = el('div', 'toast hidden');
    this.toastEl.id = 'toast';

    // HUD
    this.hud = el('div', 'hud hidden');
    const panel = el('div', 'hud-panel');
    this.mpEl = el('div', 'hud-mp', '0 MP');
    this.mpEl.id = 'hud-mp';
    this.infoEl = el('div', 'hud-info');
    this.rfEl = el('div', 'hud-rf', '0 RF');
    this.rfEl.id = 'hud-rf';
    this.scanEl = el('div', 'hud-scan');
    this.scanEl.id = 'hud-scan';
    const barWrap = el('div', 'core-bar');
    this.coreBar = el('div', 'core-bar-fill');
    barWrap.append(this.coreBar);
    panel.append(el('div', 'hud-label', 'MATERIAL POINTS'), this.mpEl, this.rfEl, this.infoEl, this.scanEl, barWrap);
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
    for (const [id, label, act] of [
      ['btn-auto', 'T AUTO', () => this.game?.toggleAuto()],
      ['btn-emitter', 'E EMITTER', () => this.game?.placeEmitter()],
    ] as const) {
      const b = el('button', 'weapon-btn', label);
      b.id = id;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (!act()) this.game?.sfx.denied();
      });
      this.weaponBar.append(b);
    }
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

    root.append(this.hud, this.weaponBar, this.panel, this.perf, this.pause, this.menu, this.settingsEl, this.victoryEl, this.confirmEl, this.toastEl);
  }

  bind(game: Game): void {
    this.game = game;
  }

  /** Shows/hides the main menu; `hasSave` toggles the Continue button. */
  showMenu(show: boolean, hasSave = false): void {
    this.menu.classList.toggle('hidden', !show);
    this.root.querySelector('#btn-continue')!.classList.toggle('hidden', !hasSave);
    this.root.querySelector('#btn-play')!.textContent = hasSave ? 'NEUES SPIEL' : 'SPIELEN';
    this.hud.classList.toggle('hidden', show);
    this.weaponBar.classList.toggle('hidden', show);
  }

  showSettings(show: boolean): void {
    this.settingsEl.classList.toggle('hidden', !show);
  }

  /** In-page confirmation (no blocking browser dialogs). */
  confirm(message: string, onYes: () => void): void {
    const c = this.confirmEl;
    c.replaceChildren();
    const box = el('div', 'menu confirm-box');
    box.append(el('p', undefined, message));
    const yes = el('button', 'btn btn-danger', 'JA');
    yes.id = 'confirm-yes';
    const no = el('button', 'btn', 'ABBRECHEN');
    no.id = 'confirm-no';
    yes.addEventListener('click', () => {
      c.classList.add('hidden');
      onYes();
    });
    no.addEventListener('click', () => c.classList.add('hidden'));
    box.append(yes, no);
    c.append(box);
    c.classList.remove('hidden');
  }

  toast(message: string, error = false, ms = 3000): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.toggle('error', error);
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  showVictory(game: Game): void {
    const v = this.victoryEl;
    v.replaceChildren();
    const box = el('div', 'menu');
    box.append(el('h1', undefined, 'KERN ZERSTÖRT'), el('div', 'subtitle', 'DIE WELT IST GEBROCHEN'));
    const t = Math.floor(game.playTime);
    const lines = [
      `Spielzeit: ${Math.floor(t / 60)} min ${t % 60} s`,
      `Zerstörte Zellen: ${fmt(game.stats.destroyed)}`,
      `Material Points gesamt: ${fmt(game.progression.totalMp)}`,
      `Resonance Fragments gesamt: ${fmt(game.progression.totalRf)}`,
    ];
    const stats = el('div', 'victory-stats');
    for (const l of lines) stats.append(el('div', undefined, l));
    const cont = el('button', 'btn', 'WEITERSPIELEN');
    cont.id = 'btn-victory-continue';
    cont.addEventListener('click', () => {
      v.classList.add('hidden');
      this.handlers.onVictoryClose();
    });
    box.append(stats, cont);
    v.append(box);
    v.classList.remove('hidden');
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
    this.settings.muted = muted;
    saveSettings(this.settings);
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
    this.rfEl.textContent = `${fmt(pr.rf)} RF`;
    const depth = Math.max(0, Math.floor(game.drone.y - game.world.height * 0.2));
    const em = pr.maxEmitters();
    this.infoEl.textContent = `Zerstört: ${fmt(game.stats.destroyed)} · Tiefe: ${depth} m` + (em ? ` · Emitter ${game.emitters.length}/${em}` : '');
    const near = game.nearestCore();
    if (near) {
      const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
      const a = Math.round(((Math.atan2(near.dy, near.dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
      this.scanEl.textContent = `RESONANZKERN ${arrows[a]} ${Math.round(near.dist)} m`;
    } else {
      this.scanEl.textContent = game.cores.length ? 'ALLE KERNE ZERSTÖRT' : '';
    }
    const total = game.cores.reduce((n, c) => n + c.total, 0);
    const left = game.cores.reduce((n, c) => n + c.remaining, 0);
    this.coreBar.style.width = total ? `${Math.round(((total - left) / total) * 100)}%` : '0%';
    const autoBtn = this.root.querySelector('#btn-auto')!;
    autoBtn.classList.toggle('locked', !pr.autoTargetUnlocked());
    autoBtn.classList.toggle('active', game.autoMode);
    this.root.querySelector('#btn-emitter')!.classList.toggle('locked', em === 0);

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
      r.cost.textContent = state === 'maxed' ? 'MAX' : `${fmt(pr.cost(r.id))} ${pr.currency(r.id).toUpperCase()}`;
      r.cost.classList.toggle('rf', pr.currency(r.id) === 'rf');
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
