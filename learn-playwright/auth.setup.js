// ─────────────────────────────────────────────────────────────────────────────
// AUTH SETUP — runs once before the test suite (see the "setup" project in config).
// It logs in and saves the browser session to .auth/state.json so real tests
// start already-authenticated.
//
// Why the retry loop? Login is gated by reCAPTCHA v3. In automation the widget
// sometimes can't reach Google ("Could not connect to the reCAPTCHA service"),
// and when that happens the Log In button fires NO request. Reloading fixes it.
// ─────────────────────────────────────────────────────────────────────────────
import { test as setup, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage.js';
import { CREDS } from './config.js';

const authFile = '.auth/state.json';

setup('authenticate', async ({ page }) => {
  const login = new LoginPage(page);

  let loggedIn = false;
  for (let attempt = 1; attempt <= 5 && !loggedIn; attempt++) {
    await login.goto();
    const response = await login.submit(CREDS.email, CREDS.password);
    if (response && response.status() === 200) {
      loggedIn = true;
    } else {
      console.log(`[auth] attempt ${attempt}: login did not succeed (reCAPTCHA?), reloading…`);
      await page.waitForTimeout(1500); // let reCAPTCHA reconnect before retrying
    }
  }

  expect(loggedIn, 'login failed after retries — reCAPTCHA may be blocking').toBeTruthy();

  // Wait until we're off the login page, then persist cookies + storage.
  await expect(page).not.toHaveURL(/\/(forget|signup)?$/i, { timeout: 10000 }).catch(() => {});
  await page.context().storageState({ path: authFile });
  console.log('[auth] session saved to', authFile);
});
