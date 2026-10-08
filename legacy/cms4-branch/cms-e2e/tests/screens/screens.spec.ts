// =============================================================================
//  SCREENS MODULE — example future-module suite. Demonstrates that a new module
//  needs only a page object + a fixture + this spec; all framework plumbing
//  (auth reuse, monitors, perf budget, tags) is inherited.
//  Runs authenticated via the cached admin session.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { ENV } from '../../config/env';
import { assertClean, expectNoStuckLoader } from '../../utils/assertions';
import { measure } from '../../utils/performance';

test.describe('Screens', () => {
  test('listing loads with screen rows or an empty state @smoke @sanity @regression', async ({
    screensPage,
  }) => {
    await screensPage.open();
    await screensPage.expectListLoaded();
  });

  test('All / Deleted / Expired tabs are present @regression', async ({ screensPage }) => {
    await screensPage.open();
    await expect(screensPage.allScreensTab).toBeVisible();
    await expect(screensPage.deletedScreensTab).toBeVisible();
    await expect(screensPage.expiredScreensTab).toBeVisible();
  });

  test('search narrows the listing or yields an empty state @regression', async ({
    screensPage,
    page,
  }) => {
    await screensPage.open();
    await screensPage.expectListLoaded();
    await screensPage.searchScreens(`zz-no-such-screen-${Date.now()}`);
    await expect.poll(() => screensPage.rowCount(), { timeout: 15_000 }).toBe(0);
    await expectNoStuckLoader(page);
  });

  test('listing loads within budget, clean console/API @regression', async ({
    screensPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await measure('screens listing', ENV.PERF.listingLoadMs, async () => {
      await screensPage.open();
      await screensPage.expectListLoaded();
    });
    await assertClean(consoleMonitor, apiMonitor);
  });
});
