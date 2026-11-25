// Autopilot pacing probe: plays Echo worlds with the real Game in headless Chrome,
// fast-forwarding the fixed simulation (no rendering). The Autopilot is granted at t=0
// (a player buys it within the first minutes); every 0.5 s the cheapest affordable
// upgrade is bought and emitters are placed. Prints minutes per core / per world.
// Usage: node scripts/pacing-auto.mjs [worlds=3] [seed=1337]   (needs `npm run build`)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const worlds = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 1337);
const server = spawn('node', ['scripts/serve.mjs', 'dist', '4175', '/games/terra/'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ECHO_IDS = ['echoMp', 'echoLaser', 'echoStart', 'echoDrone', 'echoRf', 'echoBlast', 'echoEmitter', 'echoMemory'];
let carry = null;
const minutes = [];
try {
  for (let e = 0; e < worlds; e++) {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    await page.goto(`http://localhost:4175/games/terra/index.html?seed=${seed}&echo=${e}`);
    await page.click('#btn-play');
    await page.waitForFunction(() => !!window.__game, null, { timeout: 120000 });
    await page.evaluate(({ carry, ids }) => {
      const g = window.__game;
      const p = g.progression;
      if (carry) {
        for (const id of ids) p.levels[id] = carry.levels[id] ?? 0;
        p.echo = carry.echo;
        p.mp += p.echoStartMp();
      }
      p.levels.autoTarget = 1;
      g.applyUpgrades();
      g.setPaused(false);
      window.__sim = { t: 0, coreTimes: [], lastEmitter: -999 };
    }, { carry, ids: ECHO_IDS });
    let done = false;
    let res = null;
    while (!done) {
      res = await page.evaluate(() => {
        const g = window.__game;
        const p = g.progression;
        const s = window.__sim;
        const dt = 1 / 60;
        for (let i = 0; i < 3600; i++) {
          g.tick(dt);
          s.t += dt;
          if (i % 30 === 0) {
            if (!g.autoMode && p.levels.autoTarget > 0) g.toggleAuto();
            const ids = Object.keys(p.levels);
            let best = null;
            for (const id of ids) if (p.check(id) === 'ok' && (!best || p.cost(id) < p.cost(best))) best = id;
            if (best) { p.buy(best); g.applyUpgrades(); }
            if (p.maxEmitters() > g.emitters.length && s.t - s.lastEmitter > 20) { g.placeEmitter(); s.lastEmitter = s.t; }
          }
          const done = g.cores.filter((c) => c.remaining === 0).length;
          while (s.coreTimes.length < done) s.coreTimes.push(s.t);
          if (g.victorySeen) return { done: true, t: s.t, coreTimes: s.coreTimes, echo: p.echo, levels: p.levels };
        }
        return { done: false, t: s.t, coreTimes: s.coreTimes, cleared: g.clearedFraction(), levels: p.levels, echo: p.echo };
      });
      if (res.done || res.t > 150 * 60) done = true;
    }
    const m = (v) => Math.round(v / 6) / 10;
    console.log(JSON.stringify({ echo: e, victory: res.done, min: m(res.t), cores: res.coreTimes.map(m) }));
    minutes.push(m(res.t));
    carry = { levels: res.levels, echo: res.echo + (await page.evaluate(() => window.__game.progression.echoAward(window.__game.cores.length))) };
    await page.close();
  }
  console.log('minutes per world', JSON.stringify(minutes));
} finally {
  await browser.close();
  server.kill();
}
