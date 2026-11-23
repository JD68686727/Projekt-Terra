// Art review helper: renders a few fixed scenes from the built game into
// test-results/shots/*.png (surface, laser, deep cave, core, mobile).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('test-results/shots', { recursive: true });
const server = spawn('node', ['scripts/serve.mjs', 'dist', '4175', '/games/terra/'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const only = process.argv[2];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:4175/games/terra/index.html?seed=1337');
  if (!only || only === 'menu') await page.screenshot({ path: 'test-results/shots/0-menu.png' });
  await page.click('#btn-play');
  await page.waitForFunction(() => !!window.__game);
  await page.waitForSelector('#loading', { state: 'hidden' });
  await page.waitForTimeout(1200);
  const shot = async (name, setup, wait = 900) => {
    if (only && only !== name) return;
    await page.evaluate(setup);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `test-results/shots/${name}.png` });
  };
  await shot('1-surface', () => {});
  await shot('2-laser', () => {}, 10);
  if (!only || only === '2-laser') {
    await page.mouse.move(700, 620);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'test-results/shots/2-laser.png' });
    await page.mouse.up();
  }
  await shot('3-cave', () => {
    const g = window.__game;
    const w = g.world;
    // Find an open cave pocket ~250 cells deep near the middle.
    for (let y = 700; y < 1200; y += 3)
      for (let x = 300; x < 700; x += 3)
        if (w.getMat(x, y) === 0 && w.getMat(x + 2, y) === 0 && w.getMat(x, y + 2) === 0 && w.getMat(x - 2, y) === 0) {
          g.drone.x = x + 0.5; g.drone.y = y + 0.5;
          g.camera.x = g.camera.targetX = x; g.camera.y = g.camera.targetY = y;
          return;
        }
  }, 1500);
  await shot('4-core', () => {
    const g = window.__game;
    const c = g.cores[0].site;
    g.drone.x = c.x + 0.5; g.drone.y = c.y - c.shell - 6;
    for (let y = g.drone.y - 3; y <= g.drone.y + 3; y++) for (let x = c.x - 3; x <= c.x + 3; x++) g.world.damage(x, y, 65535);
    g.camera.x = g.camera.targetX = c.x; g.camera.y = g.camera.targetY = c.y;
  }, 1500);
  await page.close();
} finally {
  await browser.close();
  server.kill();
}
