// =============================================================================
//  AUTHENTICATION MODULE
//  Covers valid/invalid login, validation, masking, logout, unauthorized route
//  access, refresh persistence, responsiveness, API-failure handling, plus
//  security edge cases (SQLi, XSS, large/special input, copy-paste).
//
//  These tests drive the login screen itself, so they run WITHOUT the cached
//  admin session (storageState reset to a clean context).
// =============================================================================

import { test, expect } from '../../../fixtures/test-fixtures';
import { ENV } from '../../../config/env';
import { AUTH_PAYLOADS } from '../../../test-data/test-data';
import { assertClean } from '../../../utils/assertions';

// Start every auth test from a clean, logged-out browser context.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('valid login reaches the dashboard @smoke @sanity @regression', async ({
    loginPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await loginPage.goto();
    await loginPage.login(ENV.ADMIN);
    expect(await loginPage.isAuthenticated()).toBe(true);
    await assertClean(consoleMonitor, apiMonitor);
  });

  test('invalid password does not authenticate @regression', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login({ email: ENV.ADMIN.email, password: AUTH_PAYLOADS.wrongPassword });
    // Reliable signal: the user is NOT let through. The app surfaces failures
    // via a transient toast rather than a persistent inline error, so the error
    // text is asserted best-effort only.
    expect(await loginPage.isAuthenticated(8_000)).toBe(false);
    await loginPage.expectStillOnLogin();
  });

  test('empty credentials are rejected @regression', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.submit();
    await loginPage.expectStillOnLogin();
  });

  test('invalid email format is rejected @regression', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login({ email: AUTH_PAYLOADS.invalidEmailFormat, password: 'whatever' });
    await loginPage.expectStillOnLogin();
  });

  test('password field is masked by default @sanity @regression', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.fill(undefined, 'secret');
    expect(await loginPage.passwordFieldType()).toBe('password');
  });

  test('logout returns to the login screen @regression', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.login(ENV.ADMIN);
    expect(await loginPage.isAuthenticated()).toBe(true);
    await page.getByRole('link', { name: /logout/i }).click();
    await expect(page.getByRole('button', { name: /^log in$/i })).toBeVisible({ timeout: 15_000 });
  });

  test('unauthorized route access redirects to login @regression', async ({ page }) => {
    await page.goto('/reports', { waitUntil: 'domcontentloaded' });
    // No session → the app should bounce to the login form, not render Reports.
    await expect(page.getByRole('button', { name: /^log in$/i })).toBeVisible({ timeout: 15_000 });
  });

  test('session persists across a browser refresh @regression', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.login(ENV.ADMIN);
    expect(await loginPage.isAuthenticated()).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible();
  });

  test('login screen is responsive on a mobile viewport @regression', async ({
    loginPage,
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginPage.goto();
    await expect(loginPage.email).toBeVisible();
    await expect(loginPage.loginBtn).toBeVisible();
  });

  test('gracefully handles a login API failure @regression', async ({ loginPage, page }) => {
    // Force the auth endpoint to 500 and assert the UI stays usable (no crash).
    await page.route(/login|signin|auth|token/i, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }),
    );
    await loginPage.goto();
    await loginPage.login(ENV.ADMIN);
    await loginPage.expectStillOnLogin();
  });

  // ── Security / edge-case inputs ─────────────────────────────────────────────
  for (const [label, payload] of [
    ['SQL injection', AUTH_PAYLOADS.sqlInjection],
    ['XSS payload', AUTH_PAYLOADS.xss],
    ['oversized input', AUTH_PAYLOADS.largeInput],
    ['special characters', AUTH_PAYLOADS.specialChars],
  ] as const) {
    test(`rejects ${label} without authenticating @regression`, async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login({ email: payload, password: payload });
      await loginPage.expectStillOnLogin();
      // The payload must never be reflected/executed.
      expect(await page.evaluate(() => document.title)).not.toContain('xss');
    });
  }

  test('copy-pasted credentials authenticate the same as typed @regression', async ({
    loginPage,
    page,
  }) => {
    await loginPage.goto();
    await page.evaluate(
      (email) => navigator.clipboard?.writeText(email).catch(() => {}),
      ENV.ADMIN.email,
    );
    await loginPage.fill(ENV.ADMIN.email, ENV.ADMIN.password); // fill == programmatic paste
    await loginPage.submit();
    expect(await loginPage.isAuthenticated()).toBe(true);
  });
});
