import { test, expect } from '@playwright/test';
import { MAKER, CHECKER, BASE_URL } from '../../utils/maker-checker/testData.js';
import { login } from '../../utils/maker-checker/helpers.js';
import { LoginPage } from '../../pages/maker-checker/LoginPage.js';
import { DashboardPage } from '../../pages/maker-checker/DashboardPage.js';

// ─── SMOKE: verify both roles can reach the dashboard ────────────────────────
test.describe('SMOKE: Login + Dashboard reachability', () => {
  test('Smoke-01: Maker logs in and lands on dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open(BASE_URL);
    await loginPage.loginExpectingSuccess(MAKER.email, MAKER.password);
    const dashboard = new DashboardPage(page);
    await dashboard.assertLoaded();
    await expect(page).toHaveURL(/cms\.pocsample\.in/);
  });

  test('Smoke-02: Checker logs in and lands on dashboard', async ({ page }) => {
    await login(page, CHECKER);
    await expect(page).toHaveURL(/cms\.pocsample\.in/);
  });
});
