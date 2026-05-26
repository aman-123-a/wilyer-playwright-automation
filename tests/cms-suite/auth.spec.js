// =============================================================================
//  AUTHENTICATION — positive, negative, edge cases.
//  Mostly live against cms.pocsample.in; token/expiry edge cases use mocking.
// =============================================================================

import { test, expect, CLEAN_STATE } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { LoginPage } from '../../pages/cms/LoginPage.js';
import { DashboardPage } from '../../pages/cms/DashboardPage.js';
import { login, logout } from '../../helpers/loginHelper.js';
import { mockUnauthorized } from '../../utils/cms/mocks.js';

// Auth tests exercise the login flow itself — always start unauthenticated,
// never from the cached admin session.
test.use({ storageState: CLEAN_STATE });

const SQLI = `' OR 1=1 --`;
const XSS = `<script>alert(1)</script>`;
const LONG = 'a'.repeat(5000);
const SPECIALS = `!#$%^&*()_+{}|:"<>?[];',./~\``;

// ── POSITIVE ────────────────────────────────────────────────────────────────
test.describe('Auth — Positive', () => {
  test('valid login lands on dashboard', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    expect(await lp.isAuthenticated()).toBeTruthy();
    await expect(new DashboardPage(page).dashboardLink).toBeVisible({ timeout: 20_000 });
  });

  test('redirects to dashboard content after login', async ({ page }) => {
    await login(page);
    const dash = new DashboardPage(page);
    await dash.expectStatCardsVisible();
  });

  test('session persists across a hard refresh', async ({ page }) => {
    await login(page);
    await page.reload({ waitUntil: 'networkidle' });
    // Still authenticated — login form must not reappear.
    await expect(page.getByRole('button', { name: /log in/i })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
  });

  test('logout returns to login screen', async ({ page }) => {
    await login(page);
    await logout(page);
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
  });
});

// ── NEGATIVE ────────────────────────────────────────────────────────────────
test.describe('Auth — Negative', () => {
  test('invalid email is rejected', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login('not-a-real-user@example.com', 'whatever123');
    await page.waitForTimeout(2500);
    await lp.expectStillOnLogin();
  });

  test('valid email + wrong password shows error', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(ENV.ADMIN_EMAIL, 'wrongPassword_' + Date.now());
    await page.waitForTimeout(2500);
    await lp.expectStillOnLogin();
    await lp.expectError();
  });

  test('empty email and password does not authenticate', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.submit(); // submit with both fields blank
    await page.waitForTimeout(1500);
    await lp.expectStillOnLogin();
  });

  test('SQL injection in email is safely rejected (no SQL error leak)', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(SQLI, 'anyPassword123');
    await page.waitForTimeout(2500);
    await lp.expectStillOnLogin();
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toMatch(/sql syntax|mysql|postgres|sqlite|odbc|ora-\d+/);
  });

  test('XSS payload does not execute', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', async (d) => { alertFired = true; await d.dismiss().catch(() => {}); });
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(ENV.ADMIN_EMAIL, XSS);
    await page.waitForTimeout(2500);
    expect(alertFired, 'alert() must not fire').toBe(false);
    expect(await page.locator('body script:has-text("alert(1)")').count()).toBe(0);
  });

  test('very long input strings do not crash login', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(LONG + '@example.com', LONG);
    await page.waitForTimeout(2000);
    await lp.expectStillOnLogin(); // app handled it gracefully
  });

  test('special characters are handled safely', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(SPECIALS, SPECIALS);
    await page.waitForTimeout(2000);
    await lp.expectStillOnLogin();
  });

  test('dashboard is not reachable without login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${ENV.BASE_URL}/`, { waitUntil: 'networkidle' });
    // Unauthenticated root should present the login form.
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible({ timeout: 15_000 });
  });

  test('expired/invalid token forces re-auth (mocked 401)', async ({ page }) => {
    await login(page);
    // From now on the backend rejects API calls as if the token expired.
    await mockUnauthorized(page, '**/api/**', 401);
    await page.goto(`${ENV.BASE_URL}/screens`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    // App must not show authenticated data while every API returns 401:
    // either it bounces to login or shows an error — never a populated table.
    const loginVisible = await page.getByRole('button', { name: /log in/i }).isVisible().catch(() => false);
    const errorVisible = await page.getByText(/unauthor|session|expired|log ?in again/i).isVisible().catch(() => false);
    const dataRows = await page.locator('table tbody tr').count();
    expect(loginVisible || errorVisible || dataRows === 0,
      'Expired token must not render authenticated data').toBeTruthy();
  });
});

// ── EDGE CASES ────────────────────────────────────────────────────────────────
test.describe('Auth — Edge Cases', () => {
  test('multiple rapid login clicks do not create a broken state', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.fill(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    // Fire several clicks fast; app should debounce / ignore duplicates.
    await Promise.all([lp.loginBtn.click(), lp.loginBtn.click().catch(() => {}), lp.loginBtn.click().catch(() => {})]);
    expect(await lp.isAuthenticated()).toBeTruthy();
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible({ timeout: 20_000 });
  });

  test('browser back after logout does not expose dashboard', async ({ page }) => {
    await login(page);
    await page.goto(`${ENV.BASE_URL}/screens`, { waitUntil: 'networkidle' });
    await logout(page);
    await page.goBack({ waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);
    // Going back must not reveal an authenticated page from cache.
    const loginVisible = await page.getByRole('button', { name: /log in/i }).isVisible().catch(() => false);
    const dataRows = await page.locator('table tbody tr').count();
    expect(loginVisible || dataRows === 0, 'Back button must not expose cached dashboard').toBeTruthy();
  });

  test('simultaneous login in two tabs both succeed', async ({ browser }) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const [a, b] = [await ctx.newPage(), await ctx.newPage()];
    await Promise.all([login(a), login(b)]);
    await expect(a.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(b.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await ctx.close();
  });

  test('network interruption during login is handled', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    // Abort the auth request once to simulate a dropped connection.
    let aborted = false;
    await page.route(/login|auth|signin|session/i, (route) => {
      if (!aborted) { aborted = true; return route.abort('failed'); }
      return route.continue();
    });
    await lp.login(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await page.waitForTimeout(2000);
    // App should not be in a broken/blank state — login form still usable.
    await expect(page.locator('body')).toBeVisible();
    await page.unroute(/login|auth|signin|session/i);
  });
});
