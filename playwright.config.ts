import { defineConfig, devices } from '@playwright/test';

// Playwright's browser CDN is not reachable in the CI sandbox; use a locally
// installed Chrome when CHROME_PATH (or /usr/bin/google-chrome) exists.
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      executablePath: chromePath,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'node scripts/serve.mjs dist 4173 /games/terra/',
    url: 'http://localhost:4173/games/terra/index.html',
    reuseExistingServer: true,
  },
  // CROSS_BROWSER=1 adds Firefox and WebKit (needs `npx playwright install firefox webkit`; not possible in the CI sandbox).
  projects: process.env.CROSS_BROWSER
    ? [
        { name: 'chromium' },
        { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: {} } },
        { name: 'webkit', use: { ...devices['Desktop Safari'], launchOptions: {} } },
      ]
    : [{ name: 'chromium' }],
});
