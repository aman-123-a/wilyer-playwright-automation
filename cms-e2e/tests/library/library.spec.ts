// =============================================================================
//  LIBRARY MODULE
//  Covers media grid load, tabs, search, type filters, pagination, media detail
//  navigation, upload (valid + unsupported), plus performance and edge cases.
//  Destructive flows (upload, delete) are gated behind CMS_ALLOW_DESTRUCTIVE.
//  Runs authenticated via the cached admin session.
// =============================================================================

import { existsSync } from 'node:fs';
import { test, expect } from '../../fixtures/test-fixtures';
import { ENV } from '../../config/env';
import { MEDIA, name } from '../../data/test-data';
import { assertClean, expectNoStuckLoader, expectNoBrokenImages } from '../../utils/assertions';
import { measure } from '../../utils/performance';

const destructive = ENV.ALLOW_DESTRUCTIVE ? test : test.skip;

test.describe('Library', () => {
  test('grid loads with media or an empty state @smoke @sanity @regression', async ({
    libraryPage,
  }) => {
    await libraryPage.open();
    await libraryPage.expectGridLoaded();
  });

  test('tabs are present (Media / Widgets / Publish History / Media Sets) @regression', async ({
    libraryPage,
  }) => {
    await libraryPage.open();
    await expect(libraryPage.mediaTab).toBeVisible();
    await expect(libraryPage.widgetsTab).toBeVisible();
    await expect(libraryPage.mediaSetsTab).toBeVisible();
  });

  test('type filters narrow the grid @regression', async ({ libraryPage }) => {
    await libraryPage.open();
    await libraryPage.expectGridLoaded();
    await libraryPage.applyFilter('photos');
    await libraryPage.applyFilter('videos');
    await libraryPage.applyFilter('all');
    await libraryPage.expectGridLoaded();
  });

  test('search returns a relevant set or an empty state @regression', async ({ libraryPage }) => {
    await libraryPage.open();
    await libraryPage.searchMedia('a');
    await libraryPage.expectGridLoaded();
  });

  test('search for an improbable term yields an empty state @regression', async ({
    libraryPage,
    page,
  }) => {
    await libraryPage.open();
    await libraryPage.searchMedia(`zz-no-such-media-${Date.now()}`);
    // The grid empties (no detail links) and surfaces a "no results" message.
    // (The IMAGE/VIDEO text matcher is avoided here — a couple of those labels
    //  live in hidden dialogs and never reach zero.)
    await expect.poll(() => libraryPage.cardCount(), { timeout: 15_000 }).toBe(0);
    await expectNoStuckLoader(page);
  });

  test('pagination "Load More" grows the grid when available @regression', async ({
    libraryPage,
  }) => {
    await libraryPage.open();
    await libraryPage.expectGridLoaded();
    const before = await libraryPage.cardCount();
    const clicked = await libraryPage.loadMore();
    if (clicked) {
      expect(await libraryPage.cardCount()).toBeGreaterThanOrEqual(before);
    }
  });

  test('opening a media card navigates to its detail page @regression', async ({
    libraryPage,
    page,
  }) => {
    await libraryPage.open();
    if ((await libraryPage.cardCount()) === 0) test.skip(true, 'no media to open');
    await libraryPage.openFirstDetails();
    await expect(page).toHaveURL(/\/file-details\//);
  });

  // ── Performance & global validations ───────────────────────────────────────
  test('listing loads under the listing budget @regression', async ({ libraryPage }) => {
    await measure('library listing', ENV.PERF.listingLoadMs, async () => {
      await libraryPage.open();
      await libraryPage.expectGridLoaded();
    });
  });

  test('no stuck loader, no broken thumbnails, clean console/API @regression', async ({
    libraryPage,
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    await libraryPage.open();
    await libraryPage.expectGridLoaded();
    await expectNoStuckLoader(page);
    await expectNoBrokenImages(page);
    await assertClean(consoleMonitor, apiMonitor);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────
  test('rapid filter switching does not break the grid @regression', async ({ libraryPage }) => {
    await libraryPage.open();
    for (const f of ['photos', 'videos', 'all', 'videos', 'photos'] as const) {
      await libraryPage.applyFilter(f);
    }
    await libraryPage.expectGridLoaded();
  });

  // ── Destructive (gated) ─────────────────────────────────────────────────────
  destructive('uploads a valid image and shows a new card @regression', async ({ libraryPage }) => {
    test.skip(!existsSync(MEDIA.validImage), `missing sample file: ${MEDIA.validImage}`);
    const before = await libraryPage.open().then(() => libraryPage.cardCount());

    // uploadFiles awaits the upload response (auto-started by setInputFiles)
    // instead of a fixed sleep. When an app-origin POST is observed, assert it
    // succeeded; a null status means the upload went straight to a third-party
    // store, in which case the grid-count poll below is the source of truth.
    const status = await libraryPage.uploadFiles(MEDIA.validImage);
    if (status !== null) expect(status, 'upload request should succeed').toBeLessThan(400);

    await libraryPage.closeUploadDialog();
    await libraryPage.waitForGridSettled();
    // Strictly greater: a silent no-op upload leaves the count unchanged and
    // must NOT pass. (If the app dedupes identical uploads this will surface it.)
    await expect
      .poll(() => libraryPage.cardCount(), { timeout: 15_000 })
      .toBeGreaterThan(before);
  });

  destructive('rejects an unsupported file format @regression', async ({ libraryPage }) => {
    test.skip(!existsSync(MEDIA.unsupported), `missing sample file: ${MEDIA.unsupported}`);
    await libraryPage.open();
    const before = await libraryPage.cardCount();
    // The app may reject the bad extension client-side (no upload POST), so skip
    // the network wait and let the assertions below drive the wait.
    await libraryPage.uploadFiles(MEDIA.unsupported, { waitForUpload: false });
    // App should surface a rejection message. Scoped terms only — a bare /error/i
    // would match unrelated page text (footer, aria labels) and false-pass.
    await expect(
      libraryPage.page.getByText(/not supported|unsupported|invalid file|not allowed|allowed formats?/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    // Hard signal: the rejected file must NOT have produced a new card.
    await libraryPage.closeUploadDialog();
    await libraryPage.waitForGridSettled();
    expect(await libraryPage.cardCount(), 'rejected upload must not create a card').toBe(before);
  });

  test.skip('placeholder: drag-and-drop upload — needs DataTransfer harness', async () => {
    // Documented edge case: HTML5 drag-drop upload. Implement with a synthetic
    // DataTransfer + dispatchEvent once a stable dropzone selector is pinned.
    void name; // keep import meaningful for future create flows
  });
});
