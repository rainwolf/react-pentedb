// Login helper — drives the real session-cookie login the app links to (UserMenu.loginUrl):
// POST the /gameServer/login.jsp form (fields name2 / password2, per LoginCookieHandler) so the
// browser context ends up holding the same pente.org session cookie the SPA's /api/db calls
// send. Credentials come from the environment (E2E_USER / E2E_PASS) and are NEVER hard-coded or
// logged — the local runner (e2e/run-local.sh) sources them from pente-react-native/.env.local.
const { expect } = require('@playwright/test');

function creds() {
  const user = process.env.E2E_USER;
  const pass = process.env.E2E_PASS;
  if (!user || !pass) {
    throw new Error(
      'E2E_USER / E2E_PASS are not set. Run the suite via e2e/run-local.sh (which sources ' +
        'pente-react-native/.env.local), or export them yourself before `npm run test:e2e`.'
    );
  }
  return { user, pass };
}

async function login(page) {
  const { user, pass } = creds();
  await page.goto('/gameServer/login.jsp');
  await page.fill('input[name="name2"]', user);
  await page.fill('input[name="password2"]', pass);
  // Submit the form itself (the JSP's submit control varies; form.submit() is robust and
  // carries the hidden fields the page injects).
  await Promise.all([
    page.waitForLoadState('load'),
    page.locator('form[name="login_form"]').evaluate((f) => f.submit()),
  ]);
  // Confirm the session now authenticates API calls (ping echoes the logged-in name).
  await expect
    .poll(async () => (await (await page.request.get('/api/db/ping')).json()).auth, {
      timeout: 20_000,
    })
    .toBe(user);
}

module.exports = { login, creds };
