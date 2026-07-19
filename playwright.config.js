// Playwright E2E config for the pentedb workbench (P4 Task 6).
//
// Runs the REAL app (`rsbuild dev`) against the REAL local backend (Tomcat on
// https://localhost, reached through rsbuild's /api/db + /gameServer proxy) and the REAL
// wasm engine — no mocks. The dev server is launched on a dedicated port (3100) so it never
// collides with a hand-run `npm start` on 3000, and PUBLIC_LOCAL_BACKEND=1 (also in
// .env.local) points the proxy at the local backend rather than production.
//
// Auth: the `setup` project logs the test account in through the same /gameServer/login.jsp
// session-cookie flow the app itself uses and saves the storageState; the `authed` project
// (analysis + import/export specs, which write to the caller's webdb_* rows) reuses it. The
// anonymous/mobile projects need no login (archive stats, search, and the client-side wasm
// AI all work signed-out). Credentials come from E2E_USER / E2E_PASS in the environment —
// see e2e/run-local.sh (git-ignored) for the local invocation that sources them.
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT) || 3100;
const baseURL = `http://localhost:${PORT}`;
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } };

module.exports = defineConfig({
  testDir: './e2e',
  // The suite drives one shared dev server + one shared backend account, and the authed
  // specs create/delete rows they then assert on — so run fully serial, single worker.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // The dev server is plain http, but the /gameServer + /api/db proxy targets a
    // self-signed https backend; ignore cert errors for any direct backend hop.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      name: 'anon',
      testMatch: /(explorer|viewer|ai)\.spec\.js/,
      use: desktop,
    },
    {
      name: 'authed',
      testMatch: /(analysis|import-export)\.spec\.js/,
      dependencies: ['setup'],
      use: { ...desktop, storageState: 'e2e/.auth/user.json' },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.js/,
      // Pixel 5 descriptor supplies isMobile + hasTouch (=> coarse pointer, which the board's
      // tap-confirm path keys off); pin the viewport to the spec's 390x844.
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    // PUBLIC_LOCAL_BACKEND is set inline (not only via `env`) so rsbuild.config.ts's
    // `process.env.PUBLIC_LOCAL_BACKEND === '1'` check always points the /api/db + /gameServer
    // proxy at the LOCAL backend — never production — regardless of how the env is threaded.
    command: `PUBLIC_LOCAL_BACKEND=1 npx rsbuild dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: { PUBLIC_LOCAL_BACKEND: '1' },
  },
});
