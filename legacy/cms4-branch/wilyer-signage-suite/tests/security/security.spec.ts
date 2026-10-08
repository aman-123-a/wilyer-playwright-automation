// =============================================================================
//  13. Security Testing — RBAC authorization + API token security.
// =============================================================================
//  Runs in the `no-auth` project (fresh context). RBAC tests log in as a
//  restricted user; if those accounts aren't provisioned they soft-skip.
// =============================================================================
import { test, expect, ENV } from '../../fixtures/test';
import { ROUTES, API } from '../../config/routes';
import { inject } from '../../utils/apiMocks';
import { assertNoWhiteScreen } from '../../utils/resilience';

async function loginOrSkip(loginPage: any, email: string, password: string) {
  try {
    await loginPage.login(email, password);
    const ok = await loginPage.page.getByRole('link', { name: /dashboard/i }).first().isVisible({ timeout: 8000 }).catch(() => false);
    test.skip(!ok, `Account ${email} not provisioned — skipping RBAC test`);
  } catch {
    test.skip(true, `Could not log in as ${email}`);
  }
}

test.describe('Security · Authorization (RBAC)', () => {
  test('viewer cannot delete', async ({ loginPage, screensPage }) => {
    await loginOrSkip(loginPage, ENV.VIEWER_EMAIL, ENV.VIEWER_PASSWORD);
    await screensPage.open();
    const row = screensPage.rowWith(/.+/).first();
    test.skip(!(await row.isVisible().catch(() => false)), 'No rows to assess');
    const del = row.getByRole('button', { name: /delete|remove|trash/i }).first();
    expect(await del.isVisible().catch(() => false), 'Viewer should not see delete controls').toBe(false);
  });

  test('viewer cannot edit', async ({ loginPage, screensPage }) => {
    await loginOrSkip(loginPage, ENV.VIEWER_EMAIL, ENV.VIEWER_PASSWORD);
    await screensPage.open();
    const row = screensPage.rowWith(/.+/).first();
    test.skip(!(await row.isVisible().catch(() => false)), 'No rows to assess');
    const edit = row.getByRole('button', { name: /edit/i }).first();
    expect(await edit.isVisible().catch(() => false), 'Viewer should not see edit controls').toBe(false);
  });

  test('editor cannot access billing', async ({ loginPage, page }) => {
    await loginOrSkip(loginPage, ENV.EDITOR_EMAIL, ENV.EDITOR_PASSWORD);
    await page.goto(`${ENV.BASE_URL}${ROUTES.billing}`, { waitUntil: 'domcontentloaded' });
    const denied = /403|forbidden|denied|unauthor/i.test(await page.locator('body').innerText().catch(() => '')) ||
      !/billing|invoice|payment|plan/i.test(await page.locator('body').innerText().catch(() => ''));
    expect(denied, 'Editor must not reach billing data').toBe(true);
  });
});

test.describe('Security · API token', () => {
  test('missing token → app stays usable / re-auths', async ({ loginPage, page }) => {
    await loginPage.login(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    // Strip Authorization on every API call.
    const stop = await page.route(API.any, async (route) => {
      const headers = { ...route.request().headers() };
      delete headers['authorization'];
      delete headers['Authorization'];
      await route.continue({ headers });
    }).then(() => async () => page.unroute(API.any));
    try {
      await page.goto(`${ENV.BASE_URL}${ROUTES.screens}`, { waitUntil: 'domcontentloaded' });
      await assertNoWhiteScreen(page, 'missing token');
    } finally {
      await stop();
    }
  });

  test('expired/invalid token (401) forces graceful re-auth', async ({ loginPage, page }) => {
    await loginPage.login(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    const stop = await inject(page, API.any, 'http401');
    try {
      await page.goto(`${ENV.BASE_URL}${ROUTES.screens}`, { waitUntil: 'domcontentloaded' });
      await assertNoWhiteScreen(page, '401 token');
      // App should surface a login prompt or an error, not a blank app.
      const recoverable = /login|signin|session|expired|unauthor|error/i.test(
        await page.locator('body').innerText().catch(() => ''),
      ) || (await loginPage.loginButton.isVisible().catch(() => false));
      expect(recoverable, '401 should drive re-auth or a clear error').toBe(true);
    } finally {
      await stop();
    }
  });
});
