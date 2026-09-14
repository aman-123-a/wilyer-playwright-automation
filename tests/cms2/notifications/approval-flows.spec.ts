// =============================================================================
//  Approval notifications — drive every case that produces one.
//
//  Target: cms2.pocsample.in. Creates content, so it is gated on
//  CMS_ALLOW_DESTRUCTIVE. It raises each request as the maker and decides it as
//  the checker, which is what puts the ten mails in the two inboxes that
//  approval-mail-content.spec.ts then grades.
//
//  ── Ordering ────────────────────────────────────────────────────────────────
//  Serial, and single-worker: maker and checker share one origin, so a parallel
//  worker signing in as the other role would hijack this one's session mid-test.
//
//  ── The batch-rejection case does not exist ─────────────────────────────────
//  Template 26 ("N files rejected") has no way to fire. Rejection is per file
//  and each click sends its own "1 File Rejected" mail, so rejecting two files
//  of one request produces two single-file mails, never the batch one. The test
//  for it is marked test.fail() rather than deleted, so the template is not
//  quietly forgotten.
// =============================================================================

import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ENV } from '../../../config/env';
import { ApprovalFlowsPage } from '../../../pages/ApprovalFlowsPage';
import { listInbox } from '../../../helpers/mail/yopmail';

/** The folder the maker is fenced to on cms2. */
const MAKER_FOLDER = 'sector28';

const MEDIA = [
  fileURLToPath(new URL('../../../test-data/fixtures-media/qa-batch-01.png', import.meta.url)),
  fileURLToPath(new URL('../../../test-data/fixtures-media/qa-batch-02.png', import.meta.url)),
];

const stamp = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(4, 12);

test.describe('Approval notifications · flows', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(
    !ENV.ALLOW_DESTRUCTIVE,
    'Creates playlists and uploads media. Set CMS_ALLOW_DESTRUCTIVE=true on a test server.',
  );
  test.skip(
    !ENV.MAKER.email || !ENV.CHECKER.email,
    'Needs CMS_MAKER_* and CMS_CHECKER_* in .env — see config/env.ts.',
  );

  // Playlist names carry a stamp so a rerun never collides with the last run's
  // pending requests, which would make the checker act on the wrong row.
  const run = stamp();
  const approvedPlaylist = `QA mail approve ${run}`;
  const rejectedPlaylist = `QA mail reject ${run}`;

  test('maker raises an upload request (T21/T22) @email @ui', async ({ page }) => {
    const flows = new ApprovalFlowsPage(page);
    await flows.loginAs('maker');

    // Upload needs a playlist editor to host the "+ Upload" button — the
    // library page offers no upload control to a folder-fenced maker.
    const host = await flows.createPlaylist(`QA mail host ${run}`, MAKER_FOLDER);
    await flows.uploadFiles(host, MEDIA);

    // The request is what the mail is about; prove it exists before leaving.
    await page.goto(`${ENV.BASE_URL}/library?tab=unapprovedFiles&subtab=pending`);
    await expect(page.getByText(/qa_batch_0\d/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('maker raises a playlist publish request (T38) @email @ui', async ({ page }) => {
    const flows = new ApprovalFlowsPage(page);
    await flows.loginAs('maker');

    for (const name of [approvedPlaylist, rejectedPlaylist]) {
      await flows.createPlaylist(name, MAKER_FOLDER);
      await flows.addFirstMediaToLayout();
      await flows.sendPlaylistForApproval(1);
      await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('pending');
    }
  });

  test('checker approves and rejects the uploads (T23/T24/T25) @email @ui', async ({ page }) => {
    const flows = new ApprovalFlowsPage(page);
    await flows.loginAs('checker');

    await flows.decideTopUpload('reject');
    await flows.decideTopUpload('approve');
  });

  test('a multi-file rejection sends ONE batch mail (T26) @email', async ({ page }) => {
    test.fail(
      true,
      'Template 26 is unreachable: rejection is per file and each click sends its own ' +
        '"1 File Rejected" mail, so a two-file rejection produces two single-file mails.',
    );
    const inbox = ENV.MAKER.email.split('@')[0];
    const rows = await listInbox(page, inbox, 25);
    expect(rows.filter((r) => /^\d+ Files Rejected$/.test(r.subject)).length).toBeGreaterThan(0);
  });

  test('checker approves and rejects a content publish (T28/T29) @email @ui', async ({ page }) => {
    const flows = new ApprovalFlowsPage(page);
    await flows.loginAs('checker');

    await page.goto(`${ENV.BASE_URL}/library?tab=unapprovedMedia&subtab=pending`);
    const pending = await page.locator('table tbody tr').count();
    test.skip(
      pending < 2,
      'Needs two pending content-publish requests. Publish media to screens as the maker first.',
    );

    await flows.decideTopPublish('approve');
    await flows.decideTopPublish('reject');
  });

  test('checker approves and rejects the playlists (T39/T40) @email @ui', async ({ page }) => {
    const flows = new ApprovalFlowsPage(page);
    await flows.loginAs('checker');

    await flows.decidePlaylist(approvedPlaylist, 'approve');
    await flows.decidePlaylist(rejectedPlaylist, 'reject');
  });
});
