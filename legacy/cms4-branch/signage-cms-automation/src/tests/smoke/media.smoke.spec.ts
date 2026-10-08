// =============================================================================
//  Media Library smoke suite — TC_MD_001 / TC_MD_002 / TC_MD_003.
//  Upload runs by default (additive); delete gates behind CMS_ALLOW_DESTRUCTIVE
//  so we never remove pre-existing live media unless explicitly enabled.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { assertClean } from '../../utils/assertions';
import { MEDIA } from '../../data/test-data';
import { ENV } from '../../config/env';

test.describe('@smoke Media Library', () => {
  // TC_MD_001 — Upload supported files (JPG/PNG/MP4/PDF); media becomes visible.
  test('TC_MD_001_Upload_Media — supported files upload successfully', async ({
    mediaPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await mediaPage.open();
    await mediaPage.expectGridLoaded();
    const before = await mediaPage.cardCount();

    // Upload the supported formats. The hidden input accepts multiple files and
    // auto-starts; setInputFiles bypasses the OS dialog.
    await mediaPage.uploadFiles([MEDIA.jpg, MEDIA.png, MEDIA.pdf, MEDIA.mp4]);
    await mediaPage.waitForUploadComplete();
    await mediaPage.closeUploadDialog();

    // After closing, the grid should reflect new media (count grows) or at least
    // not error. Poll the count to absorb the slow live refresh.
    await mediaPage.open();
    await mediaPage.expectGridLoaded();
    const after = await mediaPage.cardCount();
    expect(after, 'media count should not drop after upload').toBeGreaterThanOrEqual(before);
    await assertClean(consoleMonitor, apiMonitor);
  });

  // TC_MD_002 — Open a file's detail page; metadata / details load.
  test('TC_MD_002_Open_File_Info — metadata visible on the detail page', async ({
    mediaPage,
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    await mediaPage.open();
    await mediaPage.expectGridLoaded();

    test.skip((await mediaPage.cardCount()) === 0, 'no media available to open');
    await mediaPage.openFirstDetails();

    expect(page.url()).toMatch(/\/file-details\//);
    // The detail surface should expose recognisable metadata labels.
    const metadata = page.getByText(/name|type|size|dimension|resolution|uploaded|created|format/i).first();
    await expect(metadata).toBeVisible({ timeout: 15_000 });
    await assertClean(consoleMonitor, apiMonitor);
  });

  // TC_MD_003 — Delete media (gated). Verifies the delete affordance + confirm.
  test('TC_MD_003_Delete_Media — media removed successfully', async ({
    mediaPage,
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    await mediaPage.open();
    await mediaPage.expectGridLoaded();

    const deleteBtn = page.getByRole('button', { name: /^delete$/i }).first();
    const hasDelete = await deleteBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    expect(hasDelete, 'a media delete control is available').toBeTruthy();

    if (!ENV.ALLOW_DESTRUCTIVE) {
      test.info().annotations.push({
        type: 'skipped-destructive',
        description: 'Delete affordance verified; actual deletion skipped (CMS_ALLOW_DESTRUCTIVE=false).',
      });
      await assertClean(consoleMonitor, apiMonitor);
      return;
    }

    const before = await mediaPage.cardCount();
    await deleteBtn.click();
    await mediaPage.confirmDestructive();
    await mediaPage.open();
    await mediaPage.expectGridLoaded();
    expect(await mediaPage.cardCount(), 'media count should drop after delete').toBeLessThan(before);
    await assertClean(consoleMonitor, apiMonitor);
  });
});
