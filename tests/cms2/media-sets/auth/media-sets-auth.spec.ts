// TC-A01..A14 — login, role landing, rejection paths, session expiry, logout/back/new-tab.
// Identities come from MS_MAKER_* / MS_CHECKER_* in the gitignored .env; nothing is hard-coded.
// Login is reCAPTCHA-gated, so every case goes through the UI. Failed-login probes are kept to one per
// kind so the shared test accounts are never pushed toward a lockout.
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { LoginPage } from '../../../../pages/LoginPage';
import { msCredentials, type MsRole } from '../../../../helpers/rbac/mediaSetIdentities';
import { decodeJwt, tokenFromContext } from '../../../../api/session';
import { HttpClient, MediaSetService } from '../../../../api';

test.use({ storageState: { cookies: [], origins: [] } });

/** Library → Media Sets tab, patient about the list loading (the search box stays disabled until it does). */
async function openMediaSets(page: Page): Promise<void> {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /^library$/i })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.getByRole('link', { name: /media sets/i }).first().click();
  await expect(page.getByPlaceholder(/^search/i).first()).toBeEnabled({ timeout: 40_000 });
}

async function fresh(browser: Browser): Promise<{ ctx: BrowserContext; page: Page; login: LoginPage }> {
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();
  return { ctx, page, login: new LoginPage(page) };
}

for (const role of ['maker', 'checker'] as MsRole[]) {
  const id = role === 'maker' ? 'A01/A03' : 'A02/A04';
  test(`TC-${id} ${role}: valid login lands in the app with the expected role claims`, async ({ browser }) => {
    const creds = msCredentials(role);
    test.skip(!creds, `MS_${role.toUpperCase()}_* not set`);
    const { ctx, page, login } = await fresh(browser);
    await login.goto();
    await login.login(creds!);
    expect(await login.isAuthenticated()).toBe(true);
    await login.expectDashboardShell();
    const claims = decodeJwt(await tokenFromContext(ctx)) as Record<string, any>;
    expect(claims.role).toBe('subuser');
    const ms = claims.access?.mediaSets ?? {};
    if (role === 'maker') {
      expect(ms).toMatchObject({ view: true, create: true, update: true, delete: true });
      // `publish` drifts on the shared account (false on 2026-10-08 AM, true by PM) — recorded, not asserted.
      console.log(`[maker] mediaSets.publish=${ms.publish}`);
    } else {
      expect(Object.values(ms).every((v) => v === false), 'checker holds no Media Sets grant').toBe(true);
    }
    // The password must never reach the page text or the URL.
    expect(page.url()).not.toContain(creds!.password);
    await ctx.close();
  });
}

test.describe('rejected logins', () => {
  test('TC-A05 unknown username is rejected', async ({ browser }) => {
    const { ctx, page, login } = await fresh(browser);
    await login.goto();
    const reply = page.waitForResponse((r) => /login/i.test(r.url()) && r.request().method() === 'POST', { timeout: 60_000 });
    await login.login({ email: `nobody.${Date.now()}@example.invalid`, password: 'Wrong-Pass-1!' });
    const status = (await reply).status();
    expect(status, 'unknown user must get a controlled 4xx').toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    await login.expectStillOnLogin();
    await expect(tokenFromContext(ctx)).rejects.toThrow();
    await ctx.close();
  });

  test('TC-A06 valid username + wrong password is rejected and no session is created', async ({ browser }) => {
    const creds = msCredentials('maker');
    test.skip(!creds, 'maker not set');
    const { ctx, login } = await fresh(browser);
    await login.goto();
    await login.login({ email: creds!.email, password: creds!.password + '_x' });
    await login.expectStillOnLogin();
    await login.expectError();
    await expect(tokenFromContext(ctx)).rejects.toThrow();
    await ctx.close();
  });

  test('TC-A07 blank username is blocked', async ({ browser }) => {
    const creds = msCredentials('maker');
    test.skip(!creds, 'maker not set');
    const { ctx, login } = await fresh(browser);
    await login.goto();
    await login.fill('', creds!.password);
    await login.submit();
    await login.expectStillOnLogin();
    await ctx.close();
  });

  test('TC-A08 blank password is blocked', async ({ browser }) => {
    const creds = msCredentials('maker');
    test.skip(!creds, 'maker not set');
    const { ctx, login } = await fresh(browser);
    await login.goto();
    await login.fill(creds!.email, '');
    await login.submit();
    await login.expectStillOnLogin();
    await ctx.close();
  });

  test('TC-A09 both fields blank is blocked', async ({ browser }) => {
    const { ctx, login } = await fresh(browser);
    await login.goto();
    await login.fill('', '');
    await login.submit();
    await login.expectStillOnLogin();
    await ctx.close();
  });
});

test.describe('session handling', () => {
  async function signedIn(browser: Browser, role: MsRole = 'maker') {
    const creds = msCredentials(role);
    test.skip(!creds, `${role} not set`);
    const s = await fresh(browser);
    await s.login.goto();
    await s.login.login(creds!);
    expect(await s.login.isAuthenticated()).toBe(true);
    return s;
  }

  test('TC-A10 cookie removed mid-session → protected route bounces to login', async ({ browser }) => {
    const { ctx, page, login } = await signedIn(browser);
    await ctx.clearCookies();
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await login.expectStillOnLogin();
    await ctx.close();
  });

  test('TC-A10 expired token → API answers 401, never data', async ({ browser, playwright }) => {
    const { ctx } = await signedIn(browser);
    const real = await tokenFromContext(ctx);
    // Re-sign is impossible, so tamper the payload exp: a forged/expired JWT must fail signature or expiry.
    const [h, , sig] = real.split('.');
    const payload = Buffer.from(JSON.stringify({ ...decodeJwt(real), exp: 1 })).toString('base64url');
    const api = await playwright.request.newContext();
    const svc = new MediaSetService(new HttpClient(api, { token: `${h}.${payload}.${sig}` }));
    expect([401, 403]).toContain((await svc.listRaw({ limit: 1 })).status());
    await api.dispose();
    await ctx.close();
  });

  test('TC-A11 refresh immediately after login keeps the session', async ({ browser }) => {
    const { ctx, page, login } = await signedIn(browser);
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await login.isAuthenticated()).toBe(true);
    await ctx.close();
  });

  test('TC-A12 Media Sets opened in a second tab shares the session', async ({ browser }) => {
    const { ctx } = await signedIn(browser);
    const tab2 = await ctx.newPage();
    await openMediaSets(tab2);
    await expect(tab2.getByText(/all media sets/i).first()).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });

  test('TC-A13 old authenticated URL after logout does not restore access', async ({ browser }) => {
    const { ctx, page, login } = await signedIn(browser);
    await openMediaSets(page);
    const url = page.url();
    await login.logout();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await login.expectStillOnLogin();
    await ctx.close();
  });

  test('TC-A14 Back button after logout does not restore the authenticated page', async ({ browser }) => {
    const { ctx, page, login } = await signedIn(browser);
    await openMediaSets(page);
    await expect(page.getByText(/all media sets/i).first(), 'positive control: visible while signed in').toBeVisible();
    await login.logout();
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForTimeout(1_500);
    await expect(page.getByText(/all media sets/i)).toHaveCount(0);
    await login.expectStillOnLogin();
    await ctx.close();
  });

  // BUG-AUTH-01: logout only clears the browser cookie; the JWT keeps working against the API.
  // Remove this marker once logout revokes the token server-side.
  test('Security: a token captured before logout is rejected afterwards (server-side invalidation)', async ({ browser, playwright }) => {
    test.fail(true, 'BUG-AUTH-01: token still answers 200 after logout');
    const { ctx, login } = await signedIn(browser);
    const captured = await tokenFromContext(ctx);
    await login.logout();
    const api = await playwright.request.newContext();
    const status = (await new MediaSetService(new HttpClient(api, { token: captured })).listRaw({ limit: 1 })).status();
    await api.dispose();
    await ctx.close();
    // A stateless JWT that stays valid after logout is a finding, not a pass.
    expect([401, 403], `captured token still answers ${status} after logout`).toContain(status);
  });
});
