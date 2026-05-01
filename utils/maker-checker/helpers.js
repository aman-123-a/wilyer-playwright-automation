import fs from 'fs';
import path from 'path';
import { LoginPage } from '../../pages/maker-checker/LoginPage.js';
import { DashboardPage } from '../../pages/maker-checker/DashboardPage.js';
import { BASE_URL } from './testData.js';

/**
 * login — one-stop auth helper used by every test's beforeEach hook.
 * Wraps the POM so specs don't re-implement the flow.
 */
export async function login(page, user) {
  const loginPage = new LoginPage(page);
  await loginPage.open(BASE_URL);
  await loginPage.loginExpectingSuccess(user.email, user.password);
  const dashboard = new DashboardPage(page);
  await dashboard.assertLoaded();
  return dashboard;
}

/**
 * ensureInvalidFile — writes a binary-ish file the CMS should reject.
 * Lazy-creates it so the repo doesn't need a checked-in .exe fixture.
 */
export function ensureInvalidFile() {
  const p = path.resolve('data/sample.exe');
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, Buffer.from('MZ\x90\x00\x03invalid-binary'));
  }
  return p;
}

/**
 * retry — light wrapper around a flaky async operation. Use sparingly: prefer
 * web-first assertions (toBeVisible, etc.) which already auto-retry.
 */
export async function retry(fn, { attempts = 3, delayMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
