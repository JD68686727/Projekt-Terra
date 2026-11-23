/**
 * PlayGrid delivery check: serves dist/ with the game-host headers + CSP of
 * PlayGrid game_server.py and embeds it from a second origin in the exact
 * sandboxed iframe of templates/game.html (as of PlayGrid 4aa98ef).
 * Usage: npm run build && node scripts/playgrid-check.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
const dist = path.resolve(process.argv[2] ?? 'dist');
const PORTAL = 'http://localhost:8601';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' };
// Game host: headers copied from PlayGrid game_server.game_headers + asset_response.
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.headers['sec-fetch-dest'] === 'document') { res.writeHead(403); return res.end('Bitte öffne das Spiel im PlayGrid-Player.'); }
  const m = u.pathname.match(/^\/play-assets\/game1\/(.+)$/);
  const f = m && path.join(dist, m[1]);
  if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {
    'Content-Type': types[path.extname(f)] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "sandbox allow-scripts allow-pointer-lock; default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'self' 'unsafe-inline' data:; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors " + PORTAL,
  });
  fs.createReadStream(f).pipe(res);
}).listen(8602);
// Portal: iframe attributes copied from PlayGrid templates/game.html.
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><body style="margin:0;background:#111"><iframe id="game-frame" src="http://127.0.0.1:8602/play-assets/game1/index.html" style="width:1280px;height:720px;border:0" allow="autoplay; gamepad; fullscreen 'none'" sandbox="allow-scripts allow-pointer-lock" referrerpolicy="no-referrer"></iframe></body>`);
}).listen(8601);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 740 } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => logs.push('requestfailed: ' + r.url() + ' ' + r.failure()?.errorText));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`HTTP ${r.status()} ${r.url()}`); });
await page.goto(PORTAL);
const fr = page.frameLocator('#game-frame');
await fr.locator('#btn-play').click({ timeout: 30000 });
const frame = page.frames().find((f) => f.url().includes('8602'));
await frame.waitForFunction(() => window.__game && document.querySelector('#loading')?.classList.contains('hidden') !== false, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
const info = await frame.evaluate(async () => {
  const g = window.__game;
  let idb = 'ok', ls = 'ok';
  try { indexedDB.open('x'); } catch (e) { idb = e.name; }
  try { localStorage.getItem('x'); } catch (e) { ls = e.name; }
  return { origin: location.origin, booted: !!g, w: g?.world.width, idb, ls, store: g ? undefined : null };
});
// Fire the laser.
const box = await page.locator('#game-frame').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.78);
await page.mouse.down(); await page.waitForTimeout(2500); await page.mouse.up();
info.destroyed = await frame.evaluate(() => window.__game.stats.destroyed);
info.hudMp = await fr.locator('#hud-mp').textContent();
info.toast = await fr.locator('#toast').textContent();
await page.screenshot({ path: 'test-results/playgrid.png' });
// Reload: does progress survive?
await page.reload();
await page.waitForTimeout(3000);
info.continueVisibleAfterReload = await page.frameLocator('#game-frame').locator('#btn-continue').isVisible().catch(() => 'n/a');
console.log(JSON.stringify(info, null, 1));
console.log([...new Set(logs)].slice(0, 25).join('\n'));
await browser.close();
process.exit(0);
