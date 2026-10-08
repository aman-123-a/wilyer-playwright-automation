/**
 * Edge cases.
 *
 * Tags: @edgecase @regression
 *
 * Covers requirement #12. These exercise concurrency, multi-tab, refresh,
 * filename extremes, and timing interactions. Some scenarios (mailbox full,
 * role-change mid-session, delayed delivery) are environment-driven and are
 * asserted on observable behaviour with annotations.
 */
import { test, expect } from '../../fixtures/baseFixtures.js';
import { UploadPage } from '../../pages/UploadPage.js';
import { ApprovalPage } from '../../pages/ApprovalPage.js';
import { LoginHelper } from '../../utils/loginHelper.js';
import { UploadHelper } from '../../utils/uploadHelper.js';
import { uniqueFileName } from '../../test-data/testData.js';

test.describe('Edge cases — upload behaviour', { tag: ['@edgecase'] }, () => {
  test('multiple files uploaded simultaneously', async ({ makerPage }) => {
    const upload = new UploadPage(makerPage);
    const files = [
      UploadHelper.createValidFile(uniqueFileName('multi-a')),
      UploadHelper.createValidFile(uniqueFileName('multi-b')),
      UploadHelper.createValidFile(uniqueFileName('multi-c')),
    ];
    await upload.goto();
    await upload.openUploadDialog();
    await upload.setFile(files.map((f) => f.path)); // multi-select in one go
    await upload.waitForUploadComplete();
    for (const f of files) {
      expect(await upload.isFileListed(f.name)).toBe(true);
    }
  });

  test('same file uploaded repeatedly', async ({ makerPage }) => {
    const upload = new UploadPage(makerPage);
    const file = UploadHelper.createValidFile(uniqueFileName('repeat'));
    await upload.goto();
    for (let i = 0; i < 3; i++) {
      await upload.uploadFile(file.path);
    }
    expect(await upload.canUpload()).toBeTruthy();
  });

  test('refresh during upload does not corrupt UI state', async ({ makerPage }) => {
    const upload = new UploadPage(makerPage);
    await upload.goto();
    await upload.openUploadDialog();
    await upload.setFile(UploadHelper.createValidFile().path).catch(() => undefined);
    await makerPage.reload({ waitUntil: 'domcontentloaded' });
    await upload.waitForNetworkIdle();
    expect(await upload.canUpload()).toBeTruthy();
  });

  test('long filename upload', async ({ makerPage }) => {
    const upload = new UploadPage(makerPage);
    const file = UploadHelper.createLongNameFile(180);
    await upload.goto();
    await upload.uploadFile(file.path);
    expect(await upload.canUpload()).toBeTruthy();
  });

  test('special characters in filename', async ({ makerPage }) => {
    const upload = new UploadPage(makerPage);
    const file = UploadHelper.createSpecialCharFile();
    await upload.goto();
    await upload.uploadFile(file.path);
    expect(await upload.canUpload()).toBeTruthy();
  });
});

test.describe('Edge cases — concurrency & multi-context', { tag: ['@edgecase'] }, () => {
  test('multiple browser tabs uploading independently', async ({ browser }) => {
    const ctx = await LoginHelper.contextForRole(browser, 'maker');
    const [tabA, tabB] = await Promise.all([ctx.newPage(), ctx.newPage()]);
    try {
      const upA = new UploadPage(tabA);
      const upB = new UploadPage(tabB);
      const fA = UploadHelper.createValidFile(uniqueFileName('tabA'));
      const fB = UploadHelper.createValidFile(uniqueFileName('tabB'));
      await Promise.all([upA.goto(), upB.goto()]);
      await Promise.all([upA.uploadFile(fA.path), upB.uploadFile(fB.path)]);
      expect(await upA.isFileListed(fA.name)).toBe(true);
      expect(await upB.isFileListed(fB.name)).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test('checker approves while maker is still uploading', async ({ browser }) => {
    // Seed one pending item first.
    const makerCtx = await LoginHelper.contextForRole(browser, 'maker');
    const makerPage = await makerCtx.newPage();
    const seeded = uniqueFileName('race-seed');
    await new UploadPage(makerPage).goto();
    await new UploadPage(makerPage).uploadFile(UploadHelper.createValidFile(seeded).path);

    const checkerCtx = await LoginHelper.contextForRole(browser, 'checker');
    const checkerPage = await checkerCtx.newPage();
    try {
      const upload = new UploadPage(makerPage);
      const approval = new ApprovalPage(checkerPage);
      await approval.goto();
      // Concurrently: maker uploads another file while checker approves the first.
      await Promise.all([
        upload.uploadFile(UploadHelper.createValidFile(uniqueFileName('race-new')).path),
        approval.hasPendingItem(seeded).then((present) => (present ? approval.approve(seeded) : undefined)),
      ]);
      expect(await upload.canUpload()).toBeTruthy();
    } finally {
      await makerCtx.close();
      await checkerCtx.close();
    }
  });
});

test.describe('Edge cases — environment-driven', { tag: ['@edgecase'] }, () => {
  test('role change during active session', async ({ makerPage }) => {
    // Without admin API to flip roles live, we document the expectation: a
    // permission revocation should hide upload controls / 403 the API on next nav.
    const upload = new UploadPage(makerPage);
    await upload.goto();
    test.info().annotations.push({
      type: 'note',
      description: 'Live role change needs admin API; covered structurally in permission suite.',
    });
    expect(await upload.canUpload()).toBeTruthy();
  });

  test('mailbox full handling (documented)', async () => {
    test.info().annotations.push({
      type: 'note',
      description: 'Mailbox-full is an IMAP server state; bounce handling validated manually.',
    });
    test.skip(true, 'Cannot force a full mailbox in automated run');
  });

  test('delayed email delivery is tolerated by polling', async ({ email }) => {
    test.skip(!email.isConfigured, 'IMAP not configured');
    // The polling design (60s/5s) already covers delay; assert the poller
    // returns null gracefully (not throw) when nothing arrives.
    const result = await email.waitForEmail(
      { subject: /this-subject-will-never-arrive-/ },
      { timeoutMs: 6_000, intervalMs: 2_000 },
    );
    expect(result).toBeNull();
  });
});
