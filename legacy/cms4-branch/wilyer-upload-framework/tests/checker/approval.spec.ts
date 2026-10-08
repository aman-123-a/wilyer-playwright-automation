/**
 * Checker workflow — approve & reject uploads.
 *
 * Tags: @regression @notification
 *
 * Covers requirement #7. Each test first seeds a fresh upload as the Maker so
 * the Checker has a deterministic, isolated item to act on (no reliance on
 * pre-existing queue state).
 */
import { test, expect } from '../../fixtures/baseFixtures.js';
import { UploadPage } from '../../pages/UploadPage.js';
import { ApprovalPage } from '../../pages/ApprovalPage.js';
import { LoginHelper } from '../../utils/loginHelper.js';
import { NetworkMonitor } from '../../utils/apiHelper.js';
import { Assert } from '../../utils/assertions.js';
import { UploadHelper } from '../../utils/uploadHelper.js';
import { uniqueFileName, RejectionReasons } from '../../test-data/testData.js';
import { API_PATTERNS } from '../../config/constants.js';

/** Seed a pending upload as the Maker; returns the file name. */
async function seedPendingUpload(browser: import('@playwright/test').Browser): Promise<string> {
  const ctx = await LoginHelper.contextForRole(browser, 'maker');
  const page = await ctx.newPage();
  try {
    const upload = new UploadPage(page);
    const fileName = uniqueFileName('checker-seed');
    const file = UploadHelper.createValidFile(fileName);
    await upload.goto();
    await upload.uploadFile(file.path);
    await upload.submitForApproval();
    return fileName;
  } finally {
    await ctx.close();
  }
}

test.describe('Checker — approve / reject', { tag: ['@regression', '@notification'] }, () => {
  test('approves a pending upload', async ({ browser, checkerPage }) => {
    const fileName = await seedPendingUpload(browser);
    const monitor = new NetworkMonitor(checkerPage);
    monitor.start();

    const approval = new ApprovalPage(checkerPage);
    await approval.goto();
    expect(await approval.hasPendingItem(fileName), 'seeded item should be pending').toBe(true);

    await approval.approve(fileName);

    const toast = await approval.getToastText().catch(() => '');
    expect(toast).toMatch(/approv|success/i);

    const approveCall = await monitor
      .waitForCall(API_PATTERNS.approval, 10_000)
      .catch(() => monitor.lastApprovalCall());
    Assert.apiSucceeded(approveCall, 'Approval');
  });

  test('rejects a pending upload with a reason', async ({ browser, checkerPage }) => {
    const fileName = await seedPendingUpload(browser);
    const monitor = new NetworkMonitor(checkerPage);
    monitor.start();

    const approval = new ApprovalPage(checkerPage);
    await approval.goto();
    expect(await approval.hasPendingItem(fileName)).toBe(true);

    await approval.reject(fileName, RejectionReasons.default);

    const toast = await approval.getToastText().catch(() => '');
    expect(toast).toMatch(/reject|declin|success/i);

    const rejectCall = await monitor
      .waitForCall(API_PATTERNS.approval, 10_000)
      .catch(() => monitor.lastApprovalCall());
    Assert.apiSucceeded(rejectCall, 'Rejection');
  });
});
