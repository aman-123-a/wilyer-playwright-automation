import { chromium, FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BASE_URL = 'https://cms3.pocsample.in';
const EMAIL    = process.env.CMS_EMAIL    || 'dev@wilyer.com';
const PASSWORD = process.env.CMS_PASSWORD || 'testdev';
const STATE_PATH = path.resolve(__dirname, '.auth/state.json');

/**
 * Logs in once and persists session state for every spec to reuse via
 * `use.storageState`. Skipping when a fresh-enough state file already exists
 * keeps repeated runs fast.
 */
export default async function globalSetup(_config: FullConfig) {
  const fresh = fs.existsSync(STATE_PATH)
    && Date.now() - fs.statSync(STATE_PATH).mtimeMs < 1000 * 60 * 60 * 4; // 4h
  if (fresh) {
    console.log(`[global-setup] reusing storage state at ${STATE_PATH}`);
    return;
  }

  console.log(`[global-setup] logging in as ${EMAIL} on ${BASE_URL}`);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[name="email"]').waitFor({ timeout: 20_000 });
    await page.locator('input[name="email"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);

    // The Log In click also triggers reCAPTCHA evaluation — give it room to settle
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {}),
      page.getByRole('button', { name: /log in/i }).click(),
    ]);

    // Sidebar Rollouts link uses an icon prefix; match on href for stability
    await page.locator('a[href="/content-rollout"]').first().waitFor({ timeout: 60_000 });

    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    await context.storageState({ path: STATE_PATH });
    console.log(`[global-setup] storage state saved -> ${STATE_PATH}`);
  } catch (err) {
    const shot = path.resolve(__dirname, '.auth/login-failure.png');
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.error(`[global-setup] login failed; screenshot -> ${shot}`);
    throw err;
  } finally {
    await browser.close();
  }
}
