// =============================================================================
//  PLAYLISTS MODULE — smoke + listing coverage. Runs authenticated.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { ENV } from '../../config/env';
import { assertClean, expectNoStuckLoader } from '../../utils/assertions';
import { measure } from '../../utils/performance';

test.describe('Playlists', () => {
  test('listing loads with playlist cards or an empty state @smoke @sanity @regression', async ({
    playlistsPage,
  }) => {
    await playlistsPage.open();
    await playlistsPage.expectListLoaded();
  });

  test('folder panel and toolbar actions are present @regression', async ({ playlistsPage }) => {
    await playlistsPage.open();
    await expect(playlistsPage.foldersHeader).toBeVisible();
    await expect(playlistsPage.newFolderBtn).toBeVisible();
  });

  test('"New Playlist" opens the create modal @regression', async ({ playlistsPage }) => {
    await playlistsPage.open();
    await playlistsPage.openCreateModal();
  });

  test('search narrows the listing or yields an empty state @regression', async ({
    playlistsPage,
    page,
  }) => {
    await playlistsPage.open();
    await playlistsPage.expectListLoaded();
    await playlistsPage.searchPlaylists(`zz-no-such-playlist-${Date.now()}`);
    await expect.poll(() => playlistsPage.cardCount(), { timeout: 15_000 }).toBe(0);
    await expectNoStuckLoader(page);
  });

  test('listing loads within budget, clean console/API @regression', async ({
    playlistsPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await measure('playlists listing', ENV.PERF.listingLoadMs, async () => {
      await playlistsPage.open();
      await playlistsPage.expectListLoaded();
    });
    await assertClean(consoleMonitor, apiMonitor);
  });
});
