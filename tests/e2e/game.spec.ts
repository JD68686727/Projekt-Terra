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

async function start(page: Page): Promise<void> {
  await page.goto(URL);
  await page.locator('#btn-play').click();
  await expect(page.locator('#main-menu')).toBeHidden();
}

test('boots from nested path without console errors and renders non-black', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.locator('#btn-play')).toBeVisible();
  await page.waitForFunction(() => !!window.__game);
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
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.9);
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
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
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
  await page.waitForFunction(() => !!window.__game);
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
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.85);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/pulse.png' });
  await page.waitForTimeout(1500);
  await page.mouse.up();
  const after = await page.evaluate(() => window.__game!.stats.destroyed);
  expect(after - before).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
