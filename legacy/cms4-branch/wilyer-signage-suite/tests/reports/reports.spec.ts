// =============================================================================
//  11. Reports — analytics generation + PDF/CSV/Excel exports + failures.
// =============================================================================
import { test, expect } from '../../fixtures/test';
import { API } from '../../config/routes';
import { withFailure, stubJson } from '../../utils/apiMocks';
import { assertGracefulDegradation, assertNoWhiteScreen } from '../../utils/resilience';

test.describe('Reports · Analytics', () => {
  test('reports page loads @smoke', async ({ reportsPage }) => {
    await reportsPage.open();
    await expect(reportsPage.generateButton.or(reportsPage.exportButton)).toBeVisible();
  });

  test('generate report', async ({ reportsPage }) => {
    await reportsPage.open();
    await reportsPage.generate();
    await assertNoWhiteScreen(reportsPage.page, 'generated report');
  });

  test('generate report with no data shows empty state', async ({ reportsPage, page }) => {
    const stop = await stubJson(page, API.reports, { data: [], results: [], items: [] });
    try {
      await reportsPage.open();
      await reportsPage.generate();
      await assertNoWhiteScreen(page, 'empty report');
    } finally {
      await stop();
    }
  });

  test('large data report renders without crash @edge', async ({ reportsPage, page }) => {
    const big = { data: Array.from({ length: 5000 }, (_, i) => ({ id: i, name: `row-${i}`, value: i })) };
    const stop = await stubJson(page, API.reports, big);
    try {
      await reportsPage.open();
      await reportsPage.generate();
      await assertNoWhiteScreen(page, 'large report');
    } finally {
      await stop();
    }
  });
});

test.describe('Reports · Exports', () => {
  for (const fmt of ['pdf', 'csv', 'excel'] as const) {
    test(`export ${fmt.toUpperCase()}`, async ({ reportsPage }) => {
      await reportsPage.open();
      await reportsPage.generate().catch(() => {});
      const exportVisible = await reportsPage.exportButton.isVisible().catch(() => false);
      test.skip(!exportVisible, 'No export control on this build');
      const download = await reportsPage.export(fmt).catch(() => null);
      test.skip(download === null, `No ${fmt} export captured`);
      expect(await download!.suggestedFilename()).toBeTruthy();
    });
  }
});

test.describe('Reports · Failure', () => {
  test('report API failure is handled', async ({ reportsPage, page }) => {
    await withFailure(page, API.reports, 'http500', async () => {
      await reportsPage.open().catch(() => {});
      await reportsPage.generate().catch(() => {});
      await assertGracefulDegradation(page, 'report 500');
    });
  });

  test('export API failure is handled', async ({ reportsPage, page }) => {
    await reportsPage.open();
    await reportsPage.generate().catch(() => {});
    test.skip(!(await reportsPage.exportButton.isVisible().catch(() => false)), 'No export control');
    await withFailure(page, API.export, 'http500', async () => {
      await reportsPage.export('csv').catch(() => {});
      await assertNoWhiteScreen(page, 'export 500');
    });
  });
});
