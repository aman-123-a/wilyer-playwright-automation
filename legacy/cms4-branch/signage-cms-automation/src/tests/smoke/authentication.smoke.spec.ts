// =============================================================================
//  Authentication smoke suite — TC_AC_001 / TC_AC_002 / TC_AC_003.
//  Tests start already authenticated via the cached admin storageState
//  (helpers/auth.setup.ts), so the "login" test re-verifies the live login flow
//  from a clean (unauthenticated) context to keep the cached session intact.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { LoginPage } from '../../pages/LoginPage';
import { assertClean } from '../../utils/assertions';
import { ENV } from '../../config/env';

test.describe('@smoke Authentication', () => {
  // TC_AC_001 — Login with valid credentials → dashboard visible, no errors.
  // Runs in a fresh context with NO storageState so it exercises the real login.
  test.describe('TC_AC_001 fresh login', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('TC_AC_001_Login — valid credentials reach the dashboard', async ({
      page,
      dashboardPage,
      consoleMonitor,
      apiMonitor,
    }) => {
      const login = new LoginPage(page);
      await login.goto();
      await login.login(ENV.ADMIN);

      expect(await login.isAuthenticated(), 'login should reach the dashboard shell').toBe(true);
      await dashboardPage.expectLoaded();
      // No visible login error after success.
      expect(await login.errorMessage.first().isVisible().catch(() => false)).toBeFalsy();
      await assertClean(consoleMonitor, apiMonitor);
    });
  });

  // TC_AC_002 — Logout returns to the login screen.
  // Runs in a fresh context (real login → logout) so the logout affordance is
  // exercised end-to-end, matching the live app's authenticated shell.
  test.describe('TC_AC_002 logout', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('TC_AC_002_Logout — returns to the login page', async ({ page, loginPage, dashboardPage }) => {
      await loginPage.goto();
      await loginPage.login(ENV.ADMIN);
      expect(await loginPage.isAuthenticated()).toBe(true);

      await dashboardPage.logout();
      // Back on the auth screen: the Log In button is present again.
      await expect(page.getByRole('button', { name: /^log in$/i })).toBeVisible({ timeout: 15_000 });
    });
  });

  // TC_AC_003 — Account settings show the signed-in user's information.
  test('TC_AC_003_Account_Settings — user information visible', async ({
    accountPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await accountPage.open();
    await accountPage.expectUserInfoVisible();
    await assertClean(consoleMonitor, apiMonitor);
  });
});
