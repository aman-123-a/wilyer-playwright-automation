// =============================================================================
//  REPORTS MODULE — smoke coverage of analytics, tabs, and export actions.
//  Runs authenticated.
// =============================================================================

import { test } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { assertClean } from '../../../../utils/assertions';
import { measure } from '../../../../utils/performance';

test.describe('Reports', () => {
  test('analytics view loads with tabs @smoke @sanity @regression', async ({ reportsPage }) => {
    await reportsPage.open();
    await reportsPage.expectLoaded();
  });

  test('switching to Previous Reports works @regression', async ({ reportsPage }) => {
    await reportsPage.open();
    await reportsPage.openPreviousReports();
  });

  test('export actions (PDF/CSV) are available @regression', async ({ reportsPage }) => {
    await reportsPage.open();
    await reportsPage.expectExportAvailable();
  });

  test('loads within budget, clean console/API @regression', async ({
    reportsPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await measure('reports load', ENV.PERF.pageLoadMs, async () => {
      await reportsPage.open();
      await reportsPage.expectLoaded();
    });
    await assertClean(consoleMonitor, apiMonitor);
  });
});
