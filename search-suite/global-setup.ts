// =============================================================================
//  global-setup — log in once with the admin account and cache the session to
//  storageState, so every parallel worker starts authenticated (fast + stable).
//  Uses the proven role-based selectors for cms.pocsample.in; never waits on
//  'networkidle' (this app holds long-lived connections open).
// =============================================================================

import { chromium, type FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from './config/env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const authPath = path.resolve(__dirname, ENV.AUTH_FILE);
  fs.mkdirSync(path.dirname(authPath), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(ENV.BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(
      'input[type="email"], input[placeholder*="email" i], input[name="email"]',
      { timeout: 20_000 },
    );
    await page.getByRole('textbox', { name: /email|phone/i }).fill(ENV.ADMIN_EMAIL);
    await page.getByRole('textbox', { name: /password/i }).fill(ENV.ADMIN_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();

    // Confirm we reached the authenticated shell before caching the session.
    await page.getByRole('link', { name: /dashboard/i }).waitFor({ state: 'visible', timeout: 45_000 });
    await page.context().storageState({ path: authPath });
    // eslint-disable-next-line no-console
    console.log(`[global-setup] admin session cached → ${authPath}`);
  } finally {
    await browser.close();
  }
}
