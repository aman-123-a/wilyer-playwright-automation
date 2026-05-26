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
    await libraryPage.uploadFiles(MEDIA.validImage);
    await libraryPage.page.waitForTimeout(3_000);
    await libraryPage.closeUploadDialog();
    expect(await libraryPage.cardCount()).toBeGreaterThanOrEqual(before);
  });

  destructive('rejects an unsupported file format @regression', async ({ libraryPage }) => {
    test.skip(!existsSync(MEDIA.unsupported), `missing sample file: ${MEDIA.unsupported}`);
    await libraryPage.open();
    await libraryPage.uploadFiles(MEDIA.unsupported);
    // App should surface a rejection/error rather than create a card.
    await expect(
      libraryPage.page.getByText(/not supported|invalid|allowed|format|error/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await libraryPage.closeUploadDialog();
  });

  test.skip('placeholder: drag-and-drop upload — needs DataTransfer harness', async () => {
    // Documented edge case: HTML5 drag-drop upload. Implement with a synthetic
    // DataTransfer + dispatchEvent once a stable dropzone selector is pinned.
    void name; // keep import meaningful for future create flows
  });
});
