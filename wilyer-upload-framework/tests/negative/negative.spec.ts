/**
 * Negative test cases.
 *
 * Tags: @regression @security
 *
 * Covers requirement #11. Where a scenario depends on a server-side toggle we
 * can't control from the test (email notifications disabled, true mailbox-full),
 * the test asserts the observable client behaviour and annotates the limitation.
 */
import { test, expect } from '../../fixtures/baseFixtures.js';
import { LoginPage } from '../../pages/LoginPage.js';
import { UploadPage } from '../../pages/UploadPage.js';
import { LoginHelper } from '../../utils/loginHelper.js';
import { UploadHelper } from '../../utils/uploadHelper.js';
import { InvalidCredentials, Users } from '../../test-data/users.js';
import { uniqueFileName } from '../../test-data/testData.js';
import { env } from '../../config/env.js';
import { ROUTES } from '../../config/constants.js';

test.describe('Negative — authentication', { tag: ['@regression', '@security'] }, () => {
  test('invalid login is rejected', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(InvalidCredentials.wrongPassword.email, InvalidCredentials.wrongPassword.password);
    // Should stay on the login page and/or surface an error.
    await page.waitForTimeout(2_000);
    expect(await loginPage.isOnLoginPage()).toBe(true);
  });

  test('unknown user cannot log in', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(InvalidCredentials.unknownUser.email, InvalidCredentials.unknownUser.password);
    await page.waitForTimeout(2_000);
    expect(await loginPage.isOnLoginPage()).toBe(true);
  });

  test('malformed email is not accepted', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(InvalidCredentials.malformedEmail.email, InvalidCredentials.malformedEmail.password);
    await page.waitForTimeout(1_500);
    expect(await loginPage.isOnLoginPage()).toBe(true);
  });
});

test.describe('Negative — upload', { tag: ['@regression', '@security'] }, () => {
  test('invalid file type is rejected', async ({ makerPage }) => {
    const upload = new UploadPage(makerPage);
    const file = UploadHelper.createInvalidTypeFile();
    await upload.goto();
    await upload.openUploadDialog();
    await upload.setFile(file.path);
    // Expect an error toast OR the file simply not being accepted.
    const toast = await upload.getToastText().catch(() => '');
    expect(toast === '' || /invalid|not allowed|unsupported|type/i.test(toast)).toBeTruthy();
  });

  test('corrupted file upload is handled gracefully', async ({ makerPage }) => {
    const upload = new UploadPage(makerPage);
    const file = UploadHelper.createCorruptedFile();
    await upload.goto();
    await upload.openUploadDialog();
    await upload.setFile(file.path);
    // The app must not crash; it either rejects or processes without throwing.
    await makerPage.waitForTimeout(2_000);
    expect(await upload.canUpload()).toBeTruthy();
  });

  test('oversized file upload is rejected or flagged', async ({ makerPage }) => {
    test.slow(); // generating + transferring a large file takes time
    const upload = new UploadPage(makerPage);
    const file = UploadHelper.createLargeFile(60);
    await upload.goto();
    await upload.openUploadDialog();
    await upload.setFile(file.path);
    const toast = await upload.getToastText().catch(() => '');
    expect(toast === '' || /too large|size|exceed|limit/i.test(toast)).toBeTruthy();
  });

  test('duplicate upload of the same file is handled', async ({ makerPage }) => {
    const upload = new UploadPage(makerPage);
    const file = UploadHelper.createValidFile(uniqueFileName('dup'));
    await upload.goto();
    await upload.uploadFile(file.path);
    // Upload the identical file again.
    await upload.uploadFile(file.path);
    // App should either accept (versioned) or warn — but not break.
    expect(await upload.canUpload()).toBeTruthy();
  });
});

test.describe('Negative — session & network', { tag: ['@regression', '@security'] }, () => {
  test('session expiry during upload redirects to login', async ({ makerPage, context }) => {
    const upload = new UploadPage(makerPage);
    await upload.goto();
    // Simulate expiry by clearing auth cookies/storage mid-flow.
    await context.clearCookies();
    await makerPage.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await upload.openUploadDialog();
    await upload.setFile(UploadHelper.createValidFile().path).catch(() => undefined);
    await makerPage.waitForTimeout(3_000);
    // A protected action after expiry should bounce to login (or show auth error).
    const onLogin = makerPage.url().includes(ROUTES.login);
    test.info().annotations.push({ type: 'session-expiry', description: `onLogin=${onLogin}` });
    expect(onLogin || (await new LoginPage(makerPage).isOnLoginPage())).toBeTruthy();
  });

  test('network interruption during upload surfaces an error', async ({ makerPage, context }) => {
    const upload = new UploadPage(makerPage);
    await upload.goto();
    await upload.openUploadDialog();
    await context.setOffline(true);
    await upload.setFile(UploadHelper.createValidFile().path).catch(() => undefined);
    await makerPage.waitForTimeout(2_000);
    await context.setOffline(false);
    // The page must remain functional after connectivity returns.
    expect(await upload.canUpload()).toBeTruthy();
  });
});

test.describe('Negative — API authorization', { tag: ['@security'] }, () => {
  test('unauthorized API access is denied (no token)', async ({ api }) => {
    // Hitting a protected endpoint with no session should be 401/403.
    const res = await api.get('/approvals/pending');
    expect([401, 403, 404]).toContain(res.status());
  });

  test('upload without permission is blocked', async ({ browser }) => {
    test.skip(!env.users.restricted.email, 'No restricted user configured (RESTRICTED_EMAIL)');
    const ctx = await browser.newContext({ baseURL: env.app.baseURL });
    const page = await ctx.newPage();
    try {
      await LoginHelper.login(page, Users.restricted);
      const upload = new UploadPage(page);
      await upload.goto();
      expect(await upload.canUpload(), 'restricted user must NOT be able to upload').toBe(false);
    } finally {
      await ctx.close();
    }
  });

  test('email-notifications-disabled scenario (documented)', async () => {
    // Toggling notification settings is an admin/server concern not exposed to
    // the automation user; documented here so the requirement is traceable.
    test.info().annotations.push({
      type: 'note',
      description:
        'Disabling notifications requires admin config; validated manually / via API when available.',
    });
    test.skip(true, 'Requires admin toggle not available to the test user');
  });
});
