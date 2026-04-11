import { test, expect } from '@playwright/test';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL       = 'https://cms.pocsample.in/';
const VALID_EMAIL    = 'dev@wilyer.com';
const VALID_PASSWORD = 'testdev';

// Common malicious payloads
const SQLI_PAYLOAD = `' OR 1=1 --`;
const XSS_PAYLOAD  = `<script>alert(1)</script>`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function gotoLogin(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 15_000 });
}

async function fillCredentials(page, email, password) {
  await page.getByRole('textbox', { name: /email|phone/i }).fill(email);
  await page.getByRole('textbox', { name: /password/i }).fill(password);
}

async function submitLogin(page) {
  await page.getByRole('button', { name: /log in/i }).click();
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Login Security Suite — cms.pocsample.in', () => {

  test.setTimeout(60_000);

  // 1. Positive Case ──────────────────────────────────────────────────────────
  test('Positive: valid credentials land on dashboard', async ({ page }) => {
    await gotoLogin(page);
    await fillCredentials(page, VALID_EMAIL, VALID_PASSWORD);
    await submitLogin(page);

    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Login form should no longer be on screen — proves we are past auth
    await expect(
      page.getByRole('button', { name: /log in/i })
    ).toHaveCount(0, { timeout: 15_000 });

    // Password field should also be gone from the dashboard
    await expect(
      page.getByRole('textbox', { name: /password/i })
    ).toHaveCount(0);

    console.log(`✅ Logged in — landed at: ${page.url()}`);
  });

  // 2. SQL Injection Check ────────────────────────────────────────────────────
  test('Security: SQL injection in username is rejected', async ({ page }) => {
    await gotoLogin(page);
    await fillCredentials(page, SQLI_PAYLOAD, 'anyPassword123');
    await submitLogin(page);

    // Give the backend a moment to respond
    await page.waitForTimeout(3000);

    // Must NOT be authenticated — login button should still be visible
    await expect(
      page.getByRole('button', { name: /log in/i })
    ).toBeVisible({ timeout: 10_000 });

    // URL should still be the login page
    expect(page.url()).toContain('pocsample.in');

    // No SQL error leakage in the DOM (no stack traces / SQL dialect hints)
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toMatch(/sql syntax|mysql|postgres|sqlite|odbc|ora-\d+/);

    console.log('✅ SQL injection payload safely rejected');
  });

  // 3. XSS Check ──────────────────────────────────────────────────────────────
  test('Security: XSS payload in password is sanitized', async ({ page }) => {
    // Fail the test if an alert dialog fires (means XSS executed)
    let alertFired = false;
    page.on('dialog', async (dialog) => {
      alertFired = true;
      await dialog.dismiss().catch(() => {});
    });

    await gotoLogin(page);
    await fillCredentials(page, VALID_EMAIL, XSS_PAYLOAD);
    await submitLogin(page);

    await page.waitForTimeout(3000);

    expect(alertFired, 'XSS alert() should NOT execute').toBe(false);

    // Still on login page (bad credentials)
    await expect(
      page.getByRole('button', { name: /log in/i })
    ).toBeVisible({ timeout: 10_000 });

    // Raw script tag must not have been injected into DOM as an element
    const scriptInjected = await page
      .locator('body script:has-text("alert(1)")')
      .count();
    expect(scriptInjected).toBe(0);

    console.log('✅ XSS payload safely sanitized');
  });

  // 4. Negative Case ──────────────────────────────────────────────────────────
  test('Negative: valid username + wrong password shows error', async ({ page }) => {
    await gotoLogin(page);
    await fillCredentials(page, VALID_EMAIL, 'wrongPassword_' + Date.now());
    await submitLogin(page);

    await page.waitForTimeout(3000);

    // Still on login page
    await expect(
      page.getByRole('button', { name: /log in/i })
    ).toBeVisible({ timeout: 10_000 });

    // An error/invalid message should be shown to the user
    const errorLocator = page.getByText(
      /invalid|incorrect|wrong|failed|not found|doesn't match|unauthori[sz]ed/i
    );
    await expect(errorLocator.first()).toBeVisible({ timeout: 10_000 });

    console.log('✅ Incorrect password produced a visible error message');
  });

});
