import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';

/**
 * These tests need a SECOND user — one assigned to a restricted role — to verify route blocking.
 *
 * Two ways to supply that user:
 *   (a) Hardcode creds in .env (RESTRICTED_EMAIL / RESTRICTED_PASSWORD); OR
 *   (b) Seed via API in a globalSetup and pass storageState.
 *
 * This file assumes (a). Swap to (b) if you need fresh users per run.
 */
const RESTRICTED = {
  email: process.env.RESTRICTED_EMAIL ?? '',
  password: process.env.RESTRICTED_PASSWORD ?? '',
};

test.describe('RBAC — access control for restricted users', () => {
  test.skip(
    !RESTRICTED.email || !RESTRICTED.password,
    'RESTRICTED_EMAIL / RESTRICTED_PASSWORD env vars not set',
  );

  // TC-6 ─────────────────────────────────────────────────────────────────────
  test('restricted user is blocked from /team', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(RESTRICTED.email, RESTRICTED.password);

    await page.goto('/team');
    // Either a 403-ish redirect away, or the Team nav link is absent from the sidebar.
    await expect(page).not.toHaveURL(/\/team\/?$/);
    await expect(page.getByRole('link', { name: /team/i })).toHaveCount(0);
  });

  test('restricted user is blocked from /roles', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(RESTRICTED.email, RESTRICTED.password);

    await page.goto('/roles');
    await expect(page).not.toHaveURL(/\/roles\/?$/);
  });
});
