import { GAME_SUBTITLE, GAME_TITLE, GAME_VERSION, MAX_CORES } from '../config/meta';
import type { Game, WeaponId } from '../core/Game';
import { UPGRADES, UpgradeGroup, UpgradeId } from '../progression/upgrades';
import { QUALITY_PRESETS, Quality, Settings, saveSettings } from './settings';
import { TouchStick } from './TouchStick';
import { IconName, icon } from './icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmt = (n: number) => Math.floor(n).toLocaleString('de-DE');
/** Compact number: 12.345 → 12,3 K, 4.200.000 → 4,2 Mio. */
const fmtShort = (n: number): string => {
  if (n < 100_000) return fmt(n);
  const [d, u] = n < 1e6 ? [1e3, 'K'] : n < 1e9 ? [1e6, 'Mio'] : [1e9, 'Mrd'];
  return `${(n / d).toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${u}`;
};
const GROUP_LABEL: Record<UpgradeGroup, string> = {
  laser: 'SCHNEIDLASER',
  pulse: 'PULSE CANNON',
  drill: 'DRILL MISSILE',
  nano: 'NANO SWARM',
  fracture: 'FRACTURE CHARGE',
  resonance: 'RESONANZ',
  auto: 'AUTOMATION',
  core: 'SYSTEME',
  echo: 'ECHO',
};

const GROUP_ICON: Record<UpgradeGroup, IconName> = {
  laser: 'laser',
  pulse: 'pulse',
  drill: 'drill',
  nano: 'nano',
  fracture: 'fracture',
  resonance: 'rf',
  auto: 'auto',
  core: 'core',
  echo: 'core',
};

interface UpgradeRow {
  id: UpgradeId;
  group: UpgradeGroup;
  root: HTMLElement;
  level: HTMLElement;
  pips: HTMLElement[];
  cost: HTMLButtonElement;
  costText: HTMLElement;
  max: number;
}

/** DOM overlay UI: menus, HUD, weapon bar, upgrade panel, perf overlay. */
export class Ui {
  private readonly root: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly perf: HTMLElement;
  private readonly mpEl: HTMLElement;
  private readonly rfEl: HTMLElement;
  private readonly depthEl: HTMLElement;
  private readonly destroyedEl: HTMLElement;
  private readonly emEl: HTMLElement;
  private readonly compass: HTMLElement;
  private readonly compassArrow: HTMLElement;
  private readonly scanTitle: HTMLElement;
  private readonly scanDist: HTMLElement;
  private readonly scanShield: HTMLElement;
  private readonly upBadge: HTMLElement;
  private readonly walletMp: HTMLElement;
  private readonly walletRf: HTMLElement;
  private readonly walletEcho: HTMLElement;
  private readonly goalEl: HTMLElement;
  private readonly tabBtns = new Map<string, HTMLButtonElement>();
  private readonly groupHeads: HTMLElement[] = [];
  private tab: UpgradeGroup | 'all' = 'all';
  private readonly weaponBar: HTMLElement;
  private readonly weaponBtns = new Map<WeaponId, HTMLButtonElement>();
  private readonly pulseCd: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly rows: UpgradeRow[] = [];
  private readonly muteBtn: HTMLButtonElement;
  private perfVisible = false;
  private lastHud = 0;
  private game: Game | null = null;
  private stick: TouchStick | null = null;
  private readonly settings: Settings;
  private readonly settingsEl: HTMLElement;
  private readonly confirmEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly victoryEl: HTMLElement;
  private readonly scanEl: HTMLElement;
  private toastTimer = 0;
  /** Handlers wired by main.ts. */
  handlers = {
    onContinue: () => {},
    onNewGame: () => {},
    onResume: () => {},
    onSave: () => {},
    onReset: () => {},
    onVictoryClose: () => {},
    onNewWorld: () => {},
    onEchoShop: () => {},
    onGoalClick: () => {},
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
      'WASD / Pfeiltasten: Drohne steuern · Der Laser zielt selbst<br>' +
      'Maus / Leertaste: andere Waffen auslösen oder Laser manuell zielen<br>' +
      '1–5 / Q: Waffe · U: Upgrades · T: Autopilot · E: Emitter<br>Mausrad: Zoom · Esc: Pause · M: Ton · F3: Performance<br>' +
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

    // HUD — resources (top-left)
    this.hud = el('div', 'hud hidden');
    const res = el('div', 'hud-panel res-panel');
    const mpRow = el('div', 'res-row res-mp');
    this.mpEl = el('div', 'hud-mp', '0 MP');
    this.mpEl.id = 'hud-mp';
    mpRow.append(icon('mp', 3), this.mpEl);
    const rfRow = el('div', 'res-row res-rf');
    this.rfEl = el('div', 'hud-rf', '0 RF');
    this.rfEl.id = 'hud-rf';
    rfRow.append(icon('rf', 2), this.rfEl);
    const stats = el('div', 'stat-row');
    const stat = (name: IconName, title: string): HTMLElement => {
      const s = el('span', 'stat');
      s.title = title;
      const v = el('span', 'stat-v', '0');
      s.append(icon(name, 2), v);
      stats.append(s);
      return v;
    };
    this.depthEl = stat('depth', 'Tiefe');
    this.destroyedEl = stat('broken', 'Welt zerstört');
    this.emEl = stat('emitter', 'Emitter');
    this.emEl.parentElement!.classList.add('hidden');
    res.append(mpRow, rfRow, stats);

    // HUD — core compass
    const core = el('div', 'hud-panel core-widget');
    this.compass = el('div', 'compass');
    this.compassArrow = icon('arrow', 2, 'px-icon compass-arrow');
    this.compass.append(this.compassArrow);
    this.scanEl = el('div', 'hud-scan');
    this.scanEl.id = 'hud-scan';
    this.scanTitle = el('div', 'scan-title');
    this.scanDist = el('div', 'scan-dist');
    this.scanShield = el('div', 'scan-shield');
    this.scanEl.append(this.scanTitle, this.scanDist, this.scanShield);
    this.goalEl = el('button', 'hud-goal');
    this.goalEl.id = 'hud-goal';
    this.goalEl.addEventListener('click', () => {
      if (this.goalEl.classList.contains('done')) this.handlers.onGoalClick();
    });
    core.append(this.compass, this.scanEl);
    this.hud.append(this.goalEl);
    this.hud.append(res, core);

    // Action bar (bottom centre)
    this.weaponBar = el('div', 'weapon-bar hidden');
    const slot = (id: string, name: IconName, key: string, label: string): HTMLButtonElement => {
      const b = el('button', 'slot');
      b.id = id;
      b.title = `${label} [${key}]`;
      b.append(el('span', 'slot-cd'), icon(name, 3), el('span', 'slot-key', key), el('span', 'slot-label', label), icon('lock', 2, 'px-icon slot-lock'));
      return b;
    };
    const weapons = el('div', 'bar-group');
    for (const [id, key, label] of [['laser', '1', 'LASER'], ['pulse', '2', 'PULSE'], ['drill', '3', 'DRILL'], ['nano', '4', 'NANO'], ['fracture', '5', 'FRACTURE']] as const) {
      const b = slot(`weapon-${id}`, id, key, label);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (!this.game?.selectWeapon(id)) this.game?.sfx.denied();
      });
      this.weaponBtns.set(id, b);
      weapons.append(b);
    }
    this.pulseCd = this.weaponBtns.get('pulse')!.querySelector('.slot-cd')!;
    const tools = el('div', 'bar-group');
    for (const [id, name, key, label, act] of [
      ['btn-auto', 'auto', 'T', 'PILOT', () => this.game?.toggleAuto()],
      ['btn-emitter', 'emitter', 'E', 'EMITTER', () => this.game?.placeEmitter()],
    ] as const) {
      const b = slot(id, name, key, label);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (!act()) this.game?.sfx.denied();
      });
      tools.append(b);
    }
    const upBtn = slot('btn-upgrades', 'upgrades', 'U', 'UPGRADES');
    upBtn.classList.add('upgrade-toggle');
    this.upBadge = el('span', 'slot-badge hidden', '0');
    upBtn.append(this.upBadge);
    upBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleUpgrades();
    });
    this.muteBtn = slot('btn-mute', 'sound', 'M', 'TON');
    this.muteBtn.classList.add('slot-small');
    this.muteBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleMute();
    });
    tools.append(upBtn, this.muteBtn);
    this.weaponBar.append(weapons, el('div', 'bar-sep'), tools);

    // Upgrade panel
    this.panel = el('div', 'upgrade-panel hidden');
    this.panel.id = 'upgrade-panel';
    const head = el('div', 'panel-head');
    const title = el('span', 'panel-title');
    title.append(icon('upgrades', 2), el('span', undefined, 'UPGRADES'));
    const wallet = el('span', 'panel-wallet');
    this.walletMp = el('span', 'w-mp');
    this.walletRf = el('span', 'w-rf');
    this.walletEcho = el('span', 'w-echo');
    wallet.append(icon('mp', 1), this.walletMp, icon('rf', 1), this.walletRf, icon('core', 1), this.walletEcho);
    const close = el('button', 'panel-close', '×');
    close.addEventListener('click', () => this.toggleUpgrades(false));
    head.append(title, wallet, close);
    const tabs = el('div', 'panel-tabs');
    const tabDefs: [UpgradeGroup | 'all', IconName, string][] = [
      ['all', 'upgrades', 'ALLE'],
      ...(Object.keys(GROUP_LABEL) as UpgradeGroup[]).map((g) => [g, GROUP_ICON[g], GROUP_LABEL[g]] as [UpgradeGroup, IconName, string]),
    ];
    for (const [g, ic, label] of tabDefs) {
      const t = el('button', 'tab');
      t.dataset.g = g;
      t.title = label;
      t.append(icon(ic, 2));
      t.classList.toggle('active', g === 'all');
      t.addEventListener('click', () => {
        this.tab = g;
        tabs.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', (x as HTMLElement).dataset.g === g));
        this.lastHud = 0;
      });
      this.tabBtns.set(g, t);
      tabs.append(t);
    }
    const list = el('div', 'panel-list');
    this.panel.append(head, tabs, list);
    let group: UpgradeGroup | null = null;
    for (const u of UPGRADES) {
      if (u.group !== group) {
        group = u.group;
        const gh = el('div', 'panel-group', GROUP_LABEL[group]);
        gh.dataset.g = group;
        list.append(gh);
        this.groupHeads.push(gh);
      }
      const row = el('div', 'upgrade-row');
      row.dataset.id = u.id;
      row.dataset.g = u.group;
      const ic = el('div', 'upgrade-icon');
      ic.append(icon(GROUP_ICON[u.group], 2));
      const info = el('div', 'upgrade-info');
      const name = el('div', 'upgrade-name', u.name);
      const level = el('div', 'upgrade-level');
      const pips: HTMLElement[] = [];
      if (u.maxLevel > 1 && u.maxLevel <= 10) {
        for (let i = 0; i < u.maxLevel; i++) {
          const pip = el('i', 'pip');
          pips.push(pip);
          level.append(pip);
        }
      }
      info.append(name, el('div', 'upgrade-desc', u.desc), level);
      const cost = el('button', 'upgrade-buy');
      cost.id = `buy-${u.id}`;
      const costIcon = icon(u.currency === 'rf' ? 'rf' : u.currency === 'echo' ? 'core' : 'mp', 1);
      const costText = el('span', 'cost-v');
      cost.append(costIcon, costText);
      cost.addEventListener('click', () => this.buy(u.id));
      row.append(ic, info, cost);
      list.append(row);
      this.rows.push({ id: u.id, group: u.group, root: row, level, pips, cost, costText, max: u.maxLevel });
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
    if (!this.stick) this.stick = new TouchStick(this.root, game.input.stick);
    else this.stick.rebind(game.input.stick);
  }

  /** Shows/hides the main menu; `hasSave` toggles the Continue button. */
  showMenu(show: boolean, hasSave = false): void {
    this.menu.classList.toggle('hidden', !show);
    this.root.querySelector('#btn-continue')!.classList.toggle('hidden', !hasSave);
    this.root.querySelector('#btn-play')!.textContent = hasSave ? 'NEUES SPIEL' : 'SPIELEN';
    this.hud.classList.toggle('hidden', show);
    this.root.querySelector('#touch-stick')?.classList.toggle('menu-hidden', show);
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
    box.append(el('h1', undefined, 'WELT GEBROCHEN'), el('div', 'subtitle', `ALLE ${game.cores.length} RESONANZKERNE ZERSTÖRT`));
    const t = Math.floor(game.playTime);
    const lines = [
      `Spielzeit: ${Math.floor(t / 60)} min ${t % 60} s`,
      `Zerstörte Zellen: ${fmt(game.stats.destroyed)}`,
      `Material Points gesamt: ${fmt(game.progression.totalMp)}`,
      `Resonance Fragments gesamt: ${fmt(game.progression.totalRf)}`,
      `Geheimkammern: ${game.vaults.filter((x) => x.found).length} / ${game.vaults.length}`,
      `Echo-Stufe: ${game.progression.prestige}`,
      `Echo-Fragmente erhalten: +${game.echoGained || game.progression.echoAward(game.cores.length)} (Vorrat: ${game.progression.echo})`,
    ];
    const story = el('p', 'victory-story', 'Die letzten Echos der Resonanzkerne verklingen. Unter dir liegt eine gebrochene, stille Welt – bereit, neu zu entstehen.');
    box.append(story);
    const stats = el('div', 'victory-stats');
    for (const l of lines) stats.append(el('div', undefined, l));
    const cont = el('button', 'btn', 'WEITERSPIELEN');
    cont.id = 'btn-victory-continue';
    cont.addEventListener('click', () => {
      v.classList.add('hidden');
      this.handlers.onVictoryClose();
    });
    const shop = el('button', 'btn', 'ECHO-UPGRADES');
    shop.id = 'btn-echo-shop';
    shop.addEventListener('click', () => {
      v.classList.add('hidden');
      this.handlers.onEchoShop();
    });
    const nextCores = Math.min(MAX_CORES, game.cores.length + 1);
    const nw = el('button', 'btn', `NEUE WELT (ECHO ${game.progression.prestige + 1}: ${nextCores} KERNE, +50 % MP)`);
    nw.id = 'btn-new-world';
    nw.addEventListener('click', () => {
      v.classList.add('hidden');
      this.handlers.onNewWorld();
    });
    const col = el('div', 'menu-buttons');
    col.append(nw, shop, cont);
    box.append(stats, col);
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

  toggleUpgrades(force?: boolean, tab?: UpgradeGroup | 'all'): void {
    const show = force ?? this.panel.classList.contains('hidden');
    if (tab) this.tabBtns.get(tab)?.click();
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
    // Small amounts get a decimal so early resonance progress is visible.
    const rfText = pr.rf < 10 ? pr.rf.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : fmt(pr.rf);
    this.rfEl.textContent = `${rfText} RF`;
    const depth = Math.max(0, Math.floor(game.drone.y - game.world.height * 0.2));
    const em = pr.maxEmitters();
    this.depthEl.textContent = `${depth} m`;
    const cleared = game.clearedFraction() * 100;
    this.destroyedEl.textContent = `${cleared.toLocaleString('de-DE', { minimumFractionDigits: cleared < 10 ? 2 : 1, maximumFractionDigits: cleared < 10 ? 2 : 1 })} %`;
    this.destroyedEl.parentElement!.title = `Welt zerstört · ${fmt(game.stats.destroyed)} Zellen`;
    this.emEl.parentElement!.classList.toggle('hidden', em === 0);
    this.emEl.textContent = `${game.emitters.length}/${em}`;

    const near = game.nearestCore();
    const total = game.cores.reduce((n, c) => n + c.total, 0);
    const left = game.cores.reduce((n, c) => n + c.remaining, 0);
    this.compass.style.setProperty('--p', total ? String((total - left) / total) : '0');
    if (near) {
      // Snap to 8 directions so the pixel arrow stays crisp.
      const a = Math.round(Math.atan2(near.dy, near.dx) / (Math.PI / 4)) * 45;
      this.compassArrow.style.transform = `rotate(${a}deg)`;
      this.compass.classList.remove('done');
      const idx = game.cores.indexOf(near.core) + 1;
      this.scanTitle.textContent = `RESONANZKERN ${idx}/${game.cores.length}`;
      this.scanDist.textContent = `${Math.round(near.dist)} m`;
      this.scanShield.textContent = near.core.site.shield > 1 ? `SCHILD ×${near.core.site.shield}` : '';
    } else {
      this.compass.classList.add('done');
      this.scanTitle.textContent = game.cores.length ? 'ALLE KERNE ZERSTÖRT' : '';
      this.scanDist.textContent = '';
      this.scanShield.textContent = '';
    }
    const coresDone = game.cores.filter((c) => c.remaining === 0).length;
    const allDone = game.cores.length > 0 && coresDone === game.cores.length;
    this.goalEl.classList.toggle('done', allDone);
    this.goalEl.textContent = allDone
      ? 'WELT GEBROCHEN – HIER FÜR NÄCHSTE WELT'
      : `ZIEL: ${coresDone}/${game.cores.length} KERNE ZERSTÖREN${pr.prestige ? ` · ECHO ${pr.prestige}` : ''}`;
    const autoBtn = this.root.querySelector('#btn-auto')!;
    autoBtn.classList.toggle('locked', !pr.autoTargetUnlocked());
    autoBtn.classList.toggle('active', game.autoMode);
    this.root.querySelector('#btn-emitter')!.classList.toggle('locked', em === 0);

    for (const [id, b] of this.weaponBtns) {
      b.classList.toggle('active', game.weapon === id);
      b.classList.toggle('locked', !game.weaponUnlocked(id));
      b.classList.toggle('hidden', id !== 'laser' && id !== 'pulse' && !game.weaponUnlocked(id));
    }
    const cd = Math.max(0, game.pulse.cooldownLeft / game.pulse.stats.cooldown);
    this.pulseCd.style.setProperty('--cd', cd.toFixed(3));

    // Count affordable upgrades for the toggle badge.
    let affordable = 0;
    const panelOpen = !this.panel.classList.contains('hidden');
    const groupVisible = new Set<UpgradeGroup>();
    for (const r of this.rows) {
      const state = pr.check(r.id);
      if (state === 'ok') affordable++;
      if (!panelOpen) continue;
      const lvl = pr.level(r.id);
      const show = state !== 'locked' && (this.tab === 'all' || this.tab === r.group);
      r.root.classList.toggle('hidden', !show);
      if (show) groupVisible.add(r.group);
      r.root.classList.toggle('can-buy', state === 'ok');
      r.root.classList.toggle('maxed', state === 'maxed');
      if (r.pips.length) r.pips.forEach((p, i) => p.classList.toggle('on', i < lvl));
      else r.level.textContent = r.max > 1 ? `STUFE ${lvl}/${r.max}` : lvl ? 'AKTIV' : '';
      r.cost.disabled = state !== 'ok';
      r.costText.textContent = state === 'maxed' ? 'MAX' : fmtShort(pr.cost(r.id));
      r.cost.classList.toggle('rf', pr.currency(r.id) === 'rf');
      r.cost.classList.toggle('echo', pr.currency(r.id) === 'echo');
    }
    if (panelOpen) {
      for (const gh of this.groupHeads) gh.classList.toggle('hidden', this.tab !== 'all' || !groupVisible.has(gh.dataset.g as UpgradeGroup));
      this.walletMp.textContent = fmtShort(pr.mp);
      this.walletRf.textContent = rfText;
      this.walletEcho.textContent = fmtShort(pr.echo);
    }
    const up = this.root.querySelector('#btn-upgrades')!;
    up.classList.toggle('glow', affordable > 0);
    this.upBadge.classList.toggle('hidden', affordable === 0);
    this.upBadge.textContent = String(affordable);

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
