// =============================================================================
//  Auth setup project — logs in once as admin and persists the browser session
//  to .auth/admin.json. Every browser project depends on this and reuses the
//  storageState, so individual specs start already authenticated.
//  (Requirement: authentication reuse / session storage.)
// =============================================================================

import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { ENV, ADMIN_STORAGE_STATE } from '../config/env';

setup('authenticate as admin', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(ENV.ADMIN);

  expect(await login.isAuthenticated(), 'admin login should reach the dashboard shell').toBe(true);
  await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible();

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
