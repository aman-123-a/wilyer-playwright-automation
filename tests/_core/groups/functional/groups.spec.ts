// =============================================================================
//  GROUPS MODULE — smoke + listing coverage. Inherits auth reuse, monitors,
//  perf budget, and tags from the framework. Runs authenticated.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { assertClean, expectNoStuckLoader } from '../../../../utils/assertions';
import { measure } from '../../../../utils/performance';

test.describe('Groups', () => {
  test('listing loads with group rows or an empty state @smoke @sanity @regression', async ({
    groupsPage,
  }) => {
    await groupsPage.open();
    await groupsPage.expectListLoaded();
  });

  test('"New Group" opens the create modal @regression', async ({ groupsPage }) => {
    await groupsPage.open();
    await groupsPage.openCreateModal();
  });

  test('search narrows the listing or yields an empty state @regression', async ({
    groupsPage,
    page,
  }) => {
    await groupsPage.open();
    await groupsPage.expectListLoaded();
    await groupsPage.searchGroups(`zz-no-such-group-${Date.now()}`);
    await expect.poll(() => groupsPage.rowCount(), { timeout: 15_000 }).toBe(0);
    await expectNoStuckLoader(page);
  });

  test('listing loads within budget, clean console/API @regression', async ({
    groupsPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await measure('groups listing', ENV.PERF.listingLoadMs, async () => {
      await groupsPage.open();
      await groupsPage.expectListLoaded();
    });
    await assertClean(consoleMonitor, apiMonitor);
  });
});
