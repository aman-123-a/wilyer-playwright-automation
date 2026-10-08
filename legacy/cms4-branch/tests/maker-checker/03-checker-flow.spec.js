import { test, expect } from '@playwright/test';
import { MAKER, CHECKER, FILES, uniqueName } from '../../utils/maker-checker/testData.js';
import { login } from '../../utils/maker-checker/helpers.js';
import { PlaylistPage } from '../../pages/maker-checker/PlaylistPage.js';
import { ApprovalPage } from '../../pages/maker-checker/ApprovalPage.js';

// Seed a maker-submitted playlist in its own context so the Checker tests
// always have something to review.
async function seedSubmittedPlaylist(browser, name) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await login(page, MAKER);
    const playlist = new PlaylistPage(page);
    await playlist.open();
    await playlist.createPlaylist(name);
    await playlist.uploadFile(FILES.validImage).catch(() => {});
    await playlist.submitForApproval(name);
  } finally { await ctx.close(); }
}

// ─── CHECKER: review, approve, reject, edit-before-approval ──────────────────
test.describe('CHECKER FLOW: Approvals queue', () => {
  test('Checker-01: Submitted playlist appears in approvals queue', async ({ browser, page }) => {
    const name = uniqueName('CheckerVisible');
    await seedSubmittedPlaylist(browser, name);

    await login(page, CHECKER);
    const approval = new ApprovalPage(page);
    await approval.openUnapprovedPlaylists();
    await approval.assertVisible(name);
  });

  test('Checker-02: Approve a submitted request', async ({ browser, page }) => {
    const name = uniqueName('CheckerApprove');
    await seedSubmittedPlaylist(browser, name);

    await login(page, CHECKER);
    const approval = new ApprovalPage(page);
    await approval.openUnapprovedPlaylists();
    await approval.approve(name);
  });

  test('Checker-03: Reject a request with a reason', async ({ browser, page }) => {
    const name = uniqueName('CheckerReject');
    await seedSubmittedPlaylist(browser, name);

    await login(page, CHECKER);
    const approval = new ApprovalPage(page);
    await approval.openUnapprovedPlaylists();
    await approval.reject(name, 'Rejected for automation coverage');
  });

  test('Checker-04: Edit a playlist before approving', async ({ browser, page }) => {
    const original = uniqueName('CheckerEditOrig');
    const edited   = uniqueName('CheckerEditNew');
    await seedSubmittedPlaylist(browser, original);

    await login(page, CHECKER);
    const approval = new ApprovalPage(page);
    await approval.openUnapprovedPlaylists();
    await approval.editBeforeApproval(original, edited);
    await approval.assertVisible(edited);
  });
});
