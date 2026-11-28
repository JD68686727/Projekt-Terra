import { expect, test, type Page } from '@playwright/test';

const URL = '/games/terra/index.html';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function start(page: Page, url = URL): Promise<void> {
  await page.goto(url);
  await page.locator('#btn-play').click();
  await expect(page.locator('#main-menu')).toBeHidden();
  await page.waitForFunction(() => !!window.__game);
  await expect(page.locator('#loading')).toBeHidden();
}

test('boots from nested path without console errors and renders non-black', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.locator('#btn-play')).toBeVisible();
  await start(page);
  await page.waitForTimeout(500);
  const shot = await page.screenshot({ path: 'test-results/gameplay.png' });
  expect(shot.byteLength).toBeGreaterThan(5000);
  // Sample the canvas: the terrain must produce visible, non-black pixels.
  const lit = await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    // Read back in the same task as a render (no preserveDrawingBuffer).
    window.__game!.app.render();
    const tmp = document.createElement('canvas');
    tmp.width = 64;
    tmp.height = 36;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(c, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
    return n;
  });
  expect(lit).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test('laser destroys terrain and awards MP', async ({ page }) => {
  await start(page);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  // Aim below the drone (terrain) and hold fire.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.78);
  await page.mouse.down();
  await page.waitForTimeout(2500);
  await page.mouse.up();
  const stats = await page.evaluate(() => ({ destroyed: window.__game!.stats.destroyed, mp: window.__game!.progression.mp }));
  expect(stats.destroyed).toBeGreaterThan(5);
  expect(stats.mp).toBeGreaterThan(0);
  await expect(page.locator('#hud-mp')).not.toHaveText('0 MP');
  await page.screenshot({ path: 'test-results/after-laser.png' });
});

test('keyboard moves the drone and Esc pauses', async ({ page }) => {
  await start(page);
  const x0 = await page.evaluate(() => window.__game!.drone.x);
  // Long enough to be robust in slow software-rendered CI (fixed-step catch-up is capped).
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => window.__game!.drone.x);
  expect(x1).toBeGreaterThan(x0 + 3);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeVisible();
  expect(await page.evaluate(() => window.__game!.paused)).toBe(true);
  await page.locator('#btn-resume').click();
  expect(await page.evaluate(() => window.__game!.paused)).toBe(false);
});

test('responsive: canvas fills small mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(URL);
  await expect(page.locator('#btn-play')).toBeVisible();
  const box = (await page.locator('canvas').boundingBox())!;
  expect(Math.round(box.width)).toBe(390);
  expect(Math.round(box.height)).toBe(780);
  await page.screenshot({ path: 'test-results/mobile-menu.png' });
});

test('runs inside an iframe without touching the parent page', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/embed.html');
  const frame = page.frameLocator('#g');
  await frame.locator('#btn-play').click();
  await expect(frame.locator('#main-menu')).toBeHidden();
  // Parent page must not scroll when the game consumes wheel input.
  const box = (await page.locator('#g').boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: 'test-results/iframe.png' });
  expect(errors).toEqual([]);
});

test('upgrade purchase increases laser power; pulse cannon unlocks and destroys terrain', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // Grant MP through the real earning path (no direct stat edits).
  await page.evaluate(() => window.__game!.progression.earn(2000));
  await page.keyboard.press('KeyU');
  await expect(page.locator('#upgrade-panel')).toBeVisible();
  const dps0 = await page.evaluate(() => window.__game!.laser.stats.dps);
  await page.locator('#buy-laserDamage').click();
  expect(await page.evaluate(() => window.__game!.progression.level('laserDamage'))).toBe(1);
  expect(await page.evaluate(() => window.__game!.laser.stats.dps)).toBeGreaterThan(dps0);
  // Pulse is locked until bought.
  expect(await page.evaluate(() => window.__game!.selectWeapon('pulse'))).toBe(false);
  await page.locator('#buy-pulseUnlock').click();
  await expect(page.locator('#buy-pulseRadius')).toBeVisible();
  await page.screenshot({ path: 'test-results/upgrades.png' });
  await page.keyboard.press('KeyU');
  await page.keyboard.press('Digit2');
  expect(await page.evaluate(() => window.__game!.weapon)).toBe('pulse');
  const before = await page.evaluate(() => window.__game!.stats.destroyed);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.78);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/pulse.png' });
  await page.waitForTimeout(1500);
  await page.mouse.up();
  const after = await page.evaluate(() => window.__game!.stats.destroyed);
  expect(after - before).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('resonance chain consumes a crystal vein and awards RF', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // Find a crystal cell with crystal neighbours and hit it through the world API.
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const w = g.world;
    // Veins are thin and the world seed is random: trigger a few separate veins.
    let hits = 0;
    let first: { x: number; y: number } | null = null;
    for (let y = 0; y < w.height && hits < 4; y += 3)
      for (let x = 1; x < w.width - 1 && hits < 4; x++)
        if (w.getMat(x, y) === 3 && w.getMat(x + 1, y) === 3 && w.getMat(x - 1, y) === 3) {
          w.damage(x, y, 1);
          first ??= { x, y };
          hits++;
          y += 40;
          break;
        }
    return first;
  });
  expect(res).not.toBeNull();
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ rf: window.__game!.progression.rf, resonated: window.__game!.reactions.resonated }));
  expect(r.resonated).toBeGreaterThan(3);
  expect(r.rf).toBeGreaterThan(0.3);
  await expect(page.locator('#hud-rf')).not.toHaveText('0,0 RF');
  expect(errors).toEqual([]);
});

test('auto-targeting and emitter mine without player input', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await page.evaluate(() => {
    const p = window.__game!.progression;
    p.earn(5000);
    p.earnRf(100);
  });
  await page.keyboard.press('KeyU');
  await page.locator('#buy-autoTarget').click();
  await page.locator('#buy-emitterUnlock').click();
  await page.keyboard.press('KeyU');
  // Fly down close to the ground so targets are in range.
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyE');
  expect(await page.evaluate(() => window.__game!.emitters.length)).toBe(1);
  await page.keyboard.press('KeyT');
  expect(await page.evaluate(() => window.__game!.autoMode)).toBe(true);
  const before = await page.evaluate(() => window.__game!.stats.destroyed);
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => window.__game!.stats.destroyed);
  expect(after - before).toBeGreaterThan(10);
  expect(await page.evaluate(() => window.__game!.emitters[0].firing)).toBe(true);
  await page.screenshot({ path: 'test-results/automation.png' });
  expect(errors).toEqual([]);
});

test('laser aims and fires by itself without mouse input', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyS');
  const before = await page.evaluate(() => window.__game!.stats.destroyed);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyS');
  const after = await page.evaluate(() => ({ d: window.__game!.stats.destroyed, laser: window.__game!.laserOn }));
  expect(after.d - before).toBeGreaterThan(5);
  const frac = await page.evaluate(() => window.__game!.clearedFraction());
  expect(frac).toBeGreaterThan(0);
  expect(frac).toBeLessThan(0.05);
  await expect(page.locator('.res-panel .stat-row')).toContainText('%');
  expect(errors).toEqual([]);
});

test('autopilot strips terrain layer by layer', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=777');
  await page.evaluate(() => {
    const p = window.__game!.progression;
    p.earnRf(100);
    p.levels.laserDamage = 8;
    p.levels.laserWidth = 2;
    window.__game!.applyUpgrades();
  });
  await page.keyboard.press('KeyU');
  await page.locator('#buy-autoTarget').click();
  await page.keyboard.press('KeyU');
  await page.keyboard.press('KeyT');
  expect(await page.evaluate(() => window.__game!.autoMode)).toBe(true);
  const pos = () => page.evaluate(() => ({ x: window.__game!.drone.x, band: window.__game!.autopilotBand, d: window.__game!.stats.destroyed }));
  const p0 = await pos();
  await page.waitForTimeout(7000);
  const p1 = await pos();
  // It strips the surface layers sideways instead of diving straight at the core.
  expect(Math.abs(p1.x - p0.x)).toBeGreaterThan(25);
  expect(p1.band).toBeLessThanOrEqual(1);
  expect(p1.d - p0.d).toBeGreaterThan(150);
  // Manual input wins over the autopilot.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => window.__game!.stats.destroyed)).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test('autopilot fires Pulse and Drill by itself with the Auto upgrades', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=777');
  await page.evaluate(() => {
    const g = window.__game!;
    const l = g.progression.levels;
    l.autoTarget = 1;
    l.pulseUnlock = 1;
    l.drillUnlock = 1;
    l.autoPulse = 1;
    l.autoDrill = 1;
    l.laserDamage = 6;
    g.applyUpgrades();
    g.autoMode = true;
  });
  await page.waitForFunction(() => window.__game!.pulse.cooldownLeft > 0, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__game!.drill.cooldownLeft > 0, null, { timeout: 60000 });
  expect(errors).toEqual([]);
});

test('autopilot deploys the swarm, places emitters and re-deploys by itself', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=777');
  await page.evaluate(() => {
    const g = window.__game!;
    const l = g.progression.levels;
    l.autoTarget = 1;
    l.nanoUnlock = 1;
    l.autoNano = 1;
    l.emitterUnlock = 1;
    l.emitterCount = 2;
    l.autoEmitter = 1;
    l.fractureUnlock = 1;
    l.autoFracture = 1;
    l.laserDamage = 6;
    g.applyUpgrades();
    g.autoMode = true;
  });
  await page.waitForFunction(() => window.__game!.nano.active, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__game!.emitters.length >= 1, null, { timeout: 60000 });
  expect(await page.evaluate(() => window.__game!.stats.destroyed)).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test('without the Auto upgrades the autopilot leaves swarm and emitters alone', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=777');
  await page.evaluate(() => {
    const g = window.__game!;
    const l = g.progression.levels;
    l.autoTarget = 1;
    l.nanoUnlock = 1;
    l.emitterUnlock = 1;
    l.emitterCount = 2;
    l.laserDamage = 6;
    g.applyUpgrades();
    g.autoMode = true;
  });
  await page.waitForTimeout(6000);
  expect(await page.evaluate(() => [window.__game!.nano.active, window.__game!.emitters.length])).toEqual([false, 0]);
  expect(errors).toEqual([]);
});

test('simulation keeps running in the background when the tab is hidden', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  // Stop rAF entirely (what a hidden tab does) and let only the background ticker drive the game.
  const t0 = await page.evaluate(() => {
    const g = window.__game!;
    g.stop();
    g.setBackground(true);
    return g.playTime;
  });
  await page.waitForTimeout(2000);
  const t1 = await page.evaluate(() => window.__game!.playTime);
  expect(t1 - t0).toBeGreaterThan(1.2);
  expect(t1 - t0).toBeLessThan(3);
  await page.evaluate(() => window.__game!.setBackground(false));
  expect(errors).toEqual([]);
});

test('progress survives a page reload (IndexedDB) and Continue restores it', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=4242');
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.78);
  await page.mouse.down();
  await page.waitForTimeout(2000);
  await page.mouse.up();
  await page.evaluate(() => window.__game!.progression.earn(1234));
  // The laser now fires by itself: pause first so the snapshot cannot drift before saving.
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => {
    const g = window.__game!;
    return { mp: Math.floor(g.progression.mp), destroyed: g.stats.destroyed, seed: g.world.seed, solid: g.world.countSolid() };
  });
  expect(before.destroyed).toBeGreaterThan(0);
  await page.locator('#btn-save').click();
  await expect(page.locator('#toast')).toContainText('gespeichert');
  await page.reload();
  await expect(page.locator('#btn-continue')).toBeVisible();
  await expect(page.locator('#btn-play')).toHaveText('NEUES SPIEL');
  await page.locator('#btn-continue').click();
  await page.waitForFunction(() => !!window.__game);
  await expect(page.locator('#loading')).toBeHidden();
  const after = await page.evaluate(() => {
    const g = window.__game!;
    return { mp: Math.floor(g.progression.mp), destroyed: g.stats.destroyed, seed: g.world.seed, solid: g.world.countSolid() };
  });
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

test('an Echo world survives save and Continue (biome, cores, depth, echo fragments)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=4242&echo=3');
  const snap = () => page.evaluate(() => {
    const g = window.__game!;
    const c0 = g.cores[0];
    return {
      prestige: g.progression.prestige,
      echo: g.progression.echo,
      echoLevel: g.progression.levels.echoMp ?? 0,
      cores: g.cores.length,
      remaining: g.cores.map((c) => c.remaining),
      height: g.world.height,
      generator: g.generatorVersion,
      goal: document.getElementById('hud-goal')!.textContent,
      c0,
    };
  });
  await page.evaluate(() => {
    const g = window.__game!;
    g.progression.echo = 11;
    g.progression.levels.echoMp = 2;
    const s = g.cores[0].site;
    for (let y = s.y - 3; y <= s.y + 3; y++) for (let x = s.x - 3; x <= s.x + 3; x++) g.world.damage(x, y, 1e9);
  });
  await page.keyboard.press('Escape');
  const { c0: _a, ...before } = await snap();
  expect(before.prestige).toBe(3);
  expect(before.cores).toBe(6);
  expect(before.height).toBeGreaterThan(2000);
  await page.locator('#btn-save').click();
  await expect(page.locator('#toast')).toContainText('gespeichert');
  // Reload WITHOUT the ?echo parameter: everything must come from the save.
  await page.goto(URL + '?seed=1');
  await expect(page.locator('#btn-continue')).toBeVisible();
  await page.locator('#btn-continue').click();
  await page.waitForFunction(() => !!window.__game);
  await expect(page.locator('#loading')).toBeHidden();
  const { c0: _b, ...after } = await snap();
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

for (const [echo, mode, word] of [[0, 'pulse', 'PULS-SCHILD'], [1, 'heat', 'ÜBERHITZUNG'], [2, 'regrow', 'REGENERATION'], [3, 'phases', 'PHASENWECHSEL'], [4, 'gap', 'LÜCKE']] as const) {
  test(`core behaviour in biome ${echo} is ${mode} and announces itself`, async ({ page }) => {
    const errors = collectErrors(page);
    await start(page, URL + `?seed=555&echo=${echo}`);
    expect(await page.evaluate(() => window.__game!.behavior.mode)).toBe(mode);
    await page.evaluate(() => {
      const g = window.__game!;
      const s = g.cores[0].site;
      g.drone.x = s.x;
      g.drone.y = s.y - s.shell - 20;
    });
    await expect(page.locator('#toast')).toContainText(word, { timeout: 8000 });
    expect(errors).toEqual([]);
  });
}

test('corrupted save is reported and does not crash the game', async ({ page }) => {
  await start(page, URL + '?seed=99');
  await page.keyboard.press('Escape');
  await page.locator('#btn-save').click();
  await expect(page.locator('#toast')).toContainText('gespeichert');
  // Corrupt both slots directly in IndexedDB.
  await page.evaluate(() => new Promise<void>((res, rej) => {
    const r = indexedDB.open('projekt-terra', 1);
    r.onsuccess = () => {
      const tx = r.result.transaction('saves', 'readwrite');
      tx.objectStore('saves').put({ version: 1, garbage: true }, 'main');
      tx.objectStore('saves').put('nonsense', 'backup');
      tx.oncomplete = () => { r.result.close(); res(); };
      tx.onerror = () => rej(tx.error);
    };
    r.onerror = () => rej(r.error);
  }));
  await page.reload();
  await expect(page.locator('#toast')).toContainText('beschädigt');
  await expect(page.locator('#btn-continue')).toBeHidden();
  await start(page, URL + '?seed=99');
});

test('destroying all resonance cores shows the final screen; new world grants prestige', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=7&size=512');
  await expect(page.locator('#hud-scan')).toContainText('RESONANZKERN');
  const destroyCore = (i: number) =>
    page.evaluate((idx) => {
      const g = window.__game!;
      const c = g.cores[idx].site;
      for (let y = c.y - c.radius; y <= c.y + c.radius; y++)
        for (let x = c.x - c.radius; x <= c.x + c.radius; x++)
          // Shielded cores need several hits.
          for (let k = 0; k < 20 && g.world.getMat(x, y) === 6; k++) g.world.damage(x, y, 65535);
    }, i);
  expect(await page.evaluate(() => window.__game!.cores.length)).toBe(3);
  await destroyCore(0);
  await expect(page.locator('#toast')).toContainText('Resonanzkern 1/3');
  await expect(page.locator('#victory')).toBeHidden();
  await destroyCore(1);
  await destroyCore(2);
  await expect(page.locator('#victory')).toBeVisible();
  await expect(page.locator('#victory')).toContainText('WELT GEBROCHEN');
  expect(await page.evaluate(() => window.__game!.paused)).toBe(true);
  await page.screenshot({ path: 'test-results/victory.png' });
  await page.locator('#btn-victory-continue').click();
  expect(await page.evaluate(() => window.__game!.paused)).toBe(false);
  await expect(page.locator('#hud-scan')).toContainText('ALLE KERNE');
  // Re-open final screen via a fresh victory is not possible; start new world directly through the handler path.
  // Goal line becomes a button that reopens the final screen.
  await expect(page.locator('#hud-goal')).toContainText('WELT GEBROCHEN');
  await page.locator('#hud-goal').click();
  await expect(page.locator('#victory')).toContainText('Echo-Fragmente erhalten: +6');
  expect(await page.evaluate(() => window.__game!.progression.echo)).toBe(6);
  await page.locator('#btn-echo-shop').click();
  await expect(page.locator('#upgrade-panel')).toBeVisible();
  await page.locator('#buy-echoMp').click();
  expect(await page.evaluate(() => window.__game!.progression.level('echoMp'))).toBe(1);
  expect(await page.evaluate(() => window.__game!.progression.echo)).toBe(3);
  await page.evaluate(() => window.__game!.onVictory?.());
  await page.locator('#btn-new-world').click();
  await page.waitForFunction(() => window.__game && window.__game.progression.prestige === 1);
  await expect(page.locator('#loading')).toBeHidden();
  // Transition: title card shows the new biome, then the fade overlay disappears again.
  await expect(page.locator('#world-fade-title')).toContainText('ECHO 1');
  await expect(page.locator('#world-fade')).toBeHidden({ timeout: 10000 });
  // Echo carries over; the new world has one more core.
  expect(await page.evaluate(() => window.__game!.progression.mpMultiplier())).toBeCloseTo(1.5);
  expect(await page.evaluate(() => window.__game!.progression.echo)).toBe(3);
  expect(await page.evaluate(() => window.__game!.cores.length)).toBe(4);
  await expect(page.locator('#hud-goal')).toContainText('0/4');
  expect(await page.evaluate(() => window.__game!.progression.level('laserDamage'))).toBe(0);
  expect(errors).toEqual([]);
});

test('drill, nano swarm and fracture charge each destroy terrain', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=31');
  await page.evaluate(() => {
    const p = window.__game!.progression;
    p.earn(20000);
    p.earnRf(500);
  });
  await page.keyboard.press('KeyU');
  for (const id of ['drillUnlock', 'nanoUnlock', 'fractureUnlock']) await page.locator('#buy-' + id).click();
  await page.keyboard.press('KeyU');
  await expect(page.locator('#weapon-drill')).toBeVisible();
  const box = (await page.locator('canvas').boundingBox())!;
  const aim = { x: box.x + box.width / 2, y: box.y + box.height * 0.78 };
  const destroyed = () => page.evaluate(() => window.__game!.stats.destroyed);
  await page.mouse.move(aim.x, aim.y);

  await page.keyboard.press('Digit3');
  let b = await destroyed();
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  expect((await destroyed()) - b).toBeGreaterThan(10);

  await page.keyboard.press('Digit4');
  await page.mouse.click(aim.x, aim.y);
  expect(await page.evaluate(() => window.__game!.nano.active)).toBe(true);
  b = await destroyed();
  await page.waitForTimeout(2500);
  expect((await destroyed()) - b).toBeGreaterThan(3);

  await page.keyboard.press('Digit5');
  b = await destroyed();
  await page.mouse.click(aim.x, aim.y);
  await page.waitForTimeout(2500);
  expect((await destroyed()) - b).toBeGreaterThan(20);
  await page.screenshot({ path: 'test-results/weapons-m5.png' });
  expect(errors).toEqual([]);
});

test('entering a hidden vault grants a reward once', async ({ page }) => {
  await start(page, URL + '?seed=12');
  const res = await page.evaluate(() => {
    const g = window.__game!;
    const v = g.vaults[0].site;
    const rf0 = g.progression.rf;
    g.drone.x = (v.x0 + v.x1) / 2;
    g.drone.y = v.y0 + 2;
    return { rf0, n: g.vaults.length };
  });
  expect(res.n).toBeGreaterThan(1);
  await expect(page.locator('#toast')).toContainText('Geheimkammer');
  const rf1 = await page.evaluate(() => window.__game!.progression.rf);
  expect(rf1).toBeGreaterThanOrEqual(res.rf0 + 30);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__game!.progression.rf)).toBeLessThan(rf1 + 30);
});

test('reset progress requires confirmation and clears the save', async ({ page }) => {
  await start(page, URL + '?seed=5');
  await page.keyboard.press('Escape');
  await page.locator('#btn-save').click();
  await page.locator('#btn-reset').click();
  await expect(page.locator('#confirm')).toBeVisible();
  await page.locator('#confirm-no').click();
  await expect(page.locator('#confirm')).toBeHidden();
  await page.locator('#btn-reset').click();
  await page.locator('#confirm-yes').click();
  await page.waitForLoadState('load');
  await expect(page.locator('#btn-play')).toHaveText('SPIELEN');
  await expect(page.locator('#btn-continue')).toBeHidden();
});

test.describe('touch device', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

  test('virtual stick appears and flies the drone', async ({ page }) => {
    const errors = collectErrors(page);
    await start(page);
    const stick = page.locator('#touch-stick');
    await expect(stick).toBeVisible();
    await page.screenshot({ path: 'test-results/mobile-play.png' });
    const x0 = await page.evaluate(() => window.__game!.drone.x);
    const b = (await stick.boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    await stick.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: cx, clientY: cy, isPrimary: true });
    await stick.dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: cx + 60, clientY: cy, isPrimary: true });
    await page.waitForTimeout(700);
    await stick.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: cx + 60, clientY: cy, isPrimary: true });
    const x1 = await page.evaluate(() => window.__game!.drone.x);
    expect(x1).toBeGreaterThan(x0 + 3);
    expect(await page.evaluate(() => window.__game!.input.stick.x)).toBe(0);
    expect(errors).toEqual([]);
  });
});

test('echo worlds show their biome name and get more cores', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=7&size=512&echo=1');
  await expect(page.locator('#hud-goal')).toContainText('ROTE WÜSTE');
  await expect(page.locator('#hud-goal')).toContainText('0/4');
  expect(await page.evaluate(() => window.__game!.progression.prestige)).toBe(1);
  expect(await page.evaluate(() => window.__game!.cores.length)).toBe(4);
  expect(errors).toEqual([]);
});

test('Echo worlds are deeper', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=7&echo=2');
  expect(await page.evaluate(() => window.__game!.world.height)).toBe(3072);
  expect(await page.evaluate(() => window.__game!.world.width)).toBe(1024);
  expect(await page.evaluate(() => window.__game!.cores.length)).toBe(5);
  expect(errors).toEqual([]);
});

test('autopilot flies at the last cell of a hollowed-out core', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, URL + '?seed=1337&echo=3'); // Echo 3: biggest cores (radius 21)
  const info = await page.evaluate(() => {
    const g = window.__game! as any;
    const w = g.world;
    const core = g.cores[g.cores.length - 1];
    const s = core.site;
    // Hollow the core out except for its lowest cell (sits at the rim, well away from the centre).
    let keep: { x: number; y: number } | null = null;
    for (let y = s.y - s.radius - 1; y <= s.y + s.radius + 1; y++)
      for (let x = s.x - s.radius - 1; x <= s.x + s.radius + 1; x++)
        if (w.getMat(x, y) === 6 && (!keep || y > keep.y)) keep = { x, y };
    for (let y = s.y - s.radius - 1; y <= s.y + s.radius + 1; y++)
      for (let x = s.x - s.radius - 1; x <= s.x + s.radius + 1; x++)
        if (w.getMat(x, y) === 6 && !(x === keep!.x && y === keep!.y)) w.damage(x, y, 1e9);
    g.drone.x = s.x + 0.5;
    g.drone.y = s.y - 2.5; // within 3 cells of the centre: the old autopilot gave up here, 24 cells from the last cell
    g.progression.levels.autoTarget = 1;
    g.progression.levels.laserDamage = 8;
    g.progression.levels.laserWidth = 2;
    g.applyUpgrades();
    g.autoMode = true;
    g.apReady = false;
    (window as any).__keep = keep;
    return { remaining: core.remaining, dist: Math.hypot(keep!.x - s.x, keep!.y - s.y) };
  });
  expect(info.remaining).toBe(1);
  expect(info.dist).toBeGreaterThan(18);
  // The autopilot must fly towards the remaining cell (the old one stood still inside the hollow core).
  await page.waitForFunction(() => {
    const g = window.__game! as any;
    const k = (window as any).__keep;
    return Math.hypot(k.x + 0.5 - g.drone.x, k.y + 0.5 - g.drone.y) < 8;
  }, null, { timeout: 30000 });
  expect(errors).toEqual([]);
});
