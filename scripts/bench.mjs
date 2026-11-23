// Headless performance probe. Starts the built game, fires the laser and
// moves the drone, then reports frame/sim/terrain/upload timings.
// NOTE: headless Chrome here renders with SwiftShader (software GL); numbers
// are indicative of CPU cost only, not of real GPU performance.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

// Each entry: WIDTHxHEIGHT or a single size (square).
const sizes = (process.argv[2] ?? '1024x2048').split(',');
const server = spawn('node', ['scripts/serve.mjs', 'dist', '4174', '/games/terra/'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const t0 = Date.now();
    const q = size.includes('x') ? '' : `?size=${size}`;
    await page.goto(`http://localhost:4174/games/terra/index.html${q}`);
    await page.click('#btn-play');
    await page.waitForFunction(() => !!window.__game);
    const bootMs = Date.now() - t0;
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.85);
    await page.mouse.down();
    await page.keyboard.down('KeyS');
    // Sample perf stats every frame for 4 s.
    const samples = await page.evaluate(() => new Promise((resolve) => {
      const out = [];
      const end = performance.now() + 4000;
      const f = () => {
        const p = window.__game.perf;
        out.push({ sim: p.simMs, terrain: p.terrainMs, render: p.renderMs, texels: p.texels, uploads: p.uploads });
        if (performance.now() < end) requestAnimationFrame(f); else resolve(out);
      };
      requestAnimationFrame(f);
    }));
    await page.mouse.up();
    const g = await page.evaluate(() => ({ destroyed: window.__game.stats.destroyed, fps: window.__game.perf.fps, mem: performance.memory ? performance.memory.usedJSHeapSize : 0 }));
    const avg = (k) => samples.reduce((a, s) => a + s[k], 0) / samples.length;
    const p95 = (k) => [...samples.map((s) => s[k])].sort((a, b) => a - b)[Math.floor(samples.length * 0.95)];
    console.log(JSON.stringify({
      size, bootMs, frames: samples.length, fps: +g.fps.toFixed(1),
      simAvg: +avg('sim').toFixed(3), simP95: +p95('sim').toFixed(3),
      terrainAvg: +avg('terrain').toFixed(3), terrainP95: +p95('terrain').toFixed(3),
      renderAvg: +avg('render').toFixed(3), renderP95: +p95('render').toFixed(3),
      texelsPerFrame: Math.round(avg('texels')), destroyed: g.destroyed,
      heapMB: +(g.mem / 1048576).toFixed(1),
    }));
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
