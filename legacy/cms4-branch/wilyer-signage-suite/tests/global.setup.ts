// =============================================================================
//  Setup project — authenticate once, cache the admin session.
// =============================================================================
//  Referenced by the `setup` project in playwright.config.ts. Other projects
//  depend on it and load .auth/admin.json as their storageState.
//
//  • Verifies the app is reachable (fails fast with a clear message).
//  • If CMS_MANUAL_AUTH=true, reuses a hand-captured session (handles OTP/2FA).
//  • Otherwise logs in with admin creds and saves storage state.
// =============================================================================
import { test as setup, expect, request } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LoginPage } from '../pages/LoginPage';
import { ENV } from '../config/env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_STATE = path.join(__dirname, '..', '.auth', 'admin.json');

setup('authenticate admin', async ({ page }) => {
  setup.setTimeout(90_000);

  // 1. Reachability check.
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  const res = await ctx.get(ENV.BASE_URL, { timeout: 30_000 });
  expect(res.status(), `Target ${ENV.BASE_URL} should be reachable`).toBeLessThan(500);
  await ctx.dispose();
  console.log(`[setup] ${ENV.BASE_URL} reachable (HTTP ${res.status()})`);

  fs.mkdirSync(path.dirname(ADMIN_STATE), { recursive: true });

  // 2. Manual-auth mode — reuse a pre-captured session if present.
  if (ENV.MANUAL_AUTH) {
    if (fs.existsSync(ADMIN_STATE)) {
      console.log(`[setup] CMS_MANUAL_AUTH=true — reusing ${ADMIN_STATE}`);
      return;
    }
    console.warn('[setup] CMS_MANUAL_AUTH=true but no saved session found; attempting automated login.');
  }

  // 3. Automated login + persist storage state.
  const loginPage = new LoginPage(page);
  await loginPage.login(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
  await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible({ timeout: 25_000 });
  await page.context().storageState({ path: ADMIN_STATE });
  console.log(`[setup] Admin session cached -> ${ADMIN_STATE}`);
});
