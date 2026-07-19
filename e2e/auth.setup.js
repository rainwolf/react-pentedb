// Auth setup project: log the test account in once and persist the session as storageState so
// every authed spec starts already signed in (no repeated login round-trips). Depended on by the
// `authed` project in playwright.config.js.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { login } = require('./helpers/auth');

const authFile = path.join(__dirname, '.auth', 'user.json');

test('authenticate test account', async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await login(page);
  // Warm the dev server: first request to '/' triggers rsbuild's lazy bundle compile, so the
  // first real test doesn't pay that (multi-second) cost on top of its own work.
  await page.goto('/');
  await page.waitForSelector('[data-testid="board-pane"]');
  await page.context().storageState({ path: authFile });
});
