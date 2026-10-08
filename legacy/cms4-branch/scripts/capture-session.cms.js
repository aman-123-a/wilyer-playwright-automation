// =============================================================================
//  Manual session capture for the CMS regression suite.
// =============================================================================
//  Opens a REAL (headed) browser at the CMS login page and waits for YOU to
//  log in by hand — including any OTP / 2FA step that the automated login can't
//  pass. Once you're on the dashboard it persists the browser session to
//  `.auth/admin.json`, the same file the suite already reuses
//  (see fixtures/cms-fixtures.js). After this runs, set CMS_MANUAL_AUTH=true so
//  global-setup reuses the saved session instead of trying to log in itself.
//
//  Run:   npm run cms:login
//
//  The script waits until either the dashboard link appears or you close the
//  browser. It will not time out aggressively — take as long as you need for
//  the OTP.
// =============================================================================

import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from '../utils/cms/env.js';
import { isAuthenticated } from '../helpers/loginHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_STATE = path.resolve(__dirname, '..', '.auth', 'admin.json');

async function main() {
  console.log('\n[cms:login] Opening a browser at', ENV.BASE_URL);
  console.log('[cms:login] Log in manually (enter the OTP when prompted).');
  console.log('[cms:login] The session saves automatically once you reach the dashboard.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(ENV.BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

  // Poll for successful auth for up to 5 minutes — plenty of time for an OTP.
  const deadline = Date.now() + 5 * 60_000;
  let authed = false;
  while (Date.now() < deadline) {
    if (browser.isConnected() === false) break;
    if (await isAuthenticated(page).catch(() => false)) {
      // Give the post-login shell a moment to settle cookies/localStorage.
      await page.waitForTimeout(2000);
      authed = true;
      break;
    }
    await page.waitForTimeout(1500);
  }

  if (!authed) {
    console.error('\n[cms:login] Did not detect a logged-in dashboard before timeout. Session NOT saved.');
    await browser.close().catch(() => {});
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(ADMIN_STATE), { recursive: true });
  await context.storageState({ path: ADMIN_STATE });
  console.log(`\n[cms:login] ✔ Session saved -> ${ADMIN_STATE}`);
  console.log('[cms:login] Now run the suite with CMS_MANUAL_AUTH=true to reuse it, e.g.:');
  console.log('[cms:login]   $env:CMS_MANUAL_AUTH="true"; npm run cms\n');

  await browser.close().catch(() => {});
}

main().catch((err) => {
  console.error('[cms:login] Failed:', err);
  process.exit(1);
});
