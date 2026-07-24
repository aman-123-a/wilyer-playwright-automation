// =============================================================================
//  1. Authentication
// =============================================================================
//  Runs in the `no-auth` project (no cached storageState) — every test starts
//  logged out.
// =============================================================================
import { test, expect, ENV } from '../../fixtures/test';
import { ROUTES } from '../../config/routes';
import { assertNoWhiteScreen } from '../../utils/resilience';

test.describe('Authentication', () => {
  test('valid login reaches the dashboard @smoke', async ({ loginPage, page }) => {
    await loginPage.login(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible();
  });

  test('invalid login is rejected', async ({ loginPage }) => {
    await loginPage.fill(ENV.ADMIN_EMAIL, 'definitely-wrong-password');
    await loginPage.expectLoginRejected();
  });

  test('empty username is rejected', async ({ loginPage }) => {
    await loginPage.fill('', 'something');
    await loginPage.expectLoginRejected();
  });

  test('empty password is rejected', async ({ loginPage }) => {
    await loginPage.fill(ENV.ADMIN_EMAIL, '');
    await loginPage.expectLoginRejected();
  });

  test('both fields empty is rejected', async ({ loginPage }) => {
    await loginPage.fill('', '');
    await loginPage.expectLoginRejected();
  });

  test('direct URL access without login redirects to login', async ({ page, loginPage }) => {
    await page.goto(`${ENV.BASE_URL}${ROUTES.screens}`, { waitUntil: 'domcontentloaded' });
    // The SPA auth-guard renders the login form in-place after JS runs (it keeps
    // the URL but swaps in the login view) — wait for it rather than checking
    // synchronously.
    const landedOnLogin = await loginPage.loginButton
      .waitFor({ state: 'visible', timeout: 12_000 })
      .then(() => true)
      .catch(() => /login|signin|auth/i.test(page.url()));
    expect(landedOnLogin, 'Unauthenticated deep-link should land on login').toBe(true);
    await assertNoWhiteScreen(page, 'unauth deep-link');
  });

  test('unauthorized protected page does not leak content', async ({ page }) => {
    await page.goto(`${ENV.BASE_URL}${ROUTES.team}`, { waitUntil: 'domcontentloaded' });
    // No team-management table should render to an anonymous visitor.
    const leaked = await page.getByRole('table').filter({ hasText: /email|role/i }).first().isVisible().catch(() => false);
    expect(leaked, 'Protected data must not render without auth').toBe(false);
  });

  test('logout returns to the login screen', async ({ loginPage }) => {
    await loginPage.login(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await loginPage.logout();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('session timeout / cleared cookies forces re-login', async ({ page, loginPage }) => {
    await loginPage.login(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    // Simulate an expired session by clearing storage + cookies.
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(`${ENV.BASE_URL}${ROUTES.dashboard}`, { waitUntil: 'domcontentloaded' });
    const mustReauth = await loginPage.loginButton
      .waitFor({ state: 'visible', timeout: 12_000 })
      .then(() => true)
      .catch(() => /login|signin|auth/i.test(page.url()));
    expect(mustReauth, 'Cleared session should force re-login').toBe(true);
  });
});
