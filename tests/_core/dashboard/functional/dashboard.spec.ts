// =============================================================================
//  DASHBOARD MODULE
//  Covers loading, stat cards, recent-activity table, map, quick-action
//  navigation, plus performance (load budget, no console errors / failed APIs,
//  heap sanity) and responsiveness edge cases.
//  Runs authenticated via the cached admin session.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { assertClean, expectNoBrokenImages, expectNoStuckLoader } from '../../../../utils/assertions';
import { collectMetrics, jsHeapMB, measure } from '../../../../utils/performance';

test.describe('Dashboard', () => {
  test('loads with stat cards and quick actions @smoke @sanity @regression', async ({
    dashboardPage,
  }) => {
    await dashboardPage.open();
    await dashboardPage.expectLoaded();
    await dashboardPage.expectQuickActions();
  });

  test('stat cards render numeric values @regression', async ({ dashboardPage }) => {
    await dashboardPage.open();
    for (const label of [/total screens/i, /total media files/i, /storage used/i]) {
      const value = await dashboardPage.cardValue(label);
      expect(value.trim().length, `${label} should have a value`).toBeGreaterThan(0);
    }
  });

  test('recent screens table and map render @regression', async ({ dashboardPage }) => {
    await dashboardPage.open();
    await expect(dashboardPage.recentScreensTable).toBeVisible();
    await expect(dashboardPage.recentScreensTable.locator('tbody tr').first()).toBeVisible();
    await expect(dashboardPage.mapRegion).toBeVisible();
  });

  test('quick-action "Add Media" navigates to the library upload flow @regression', async ({
    dashboardPage,
    page,
  }) => {
    await dashboardPage.open();
    await dashboardPage.addMediaBtn.click();
    await expect(page).toHaveURL(/\/library/);
  });

  test('"Total Screens" card links into the screens list @regression', async ({
    dashboardPage,
    page,
  }) => {
    await dashboardPage.open();
    await dashboardPage
      .card(/total screens/i)
      .first()
      .click();
    await expect(page).toHaveURL(/\/screens/);
  });

  // ── Performance & global validations ───────────────────────────────────────
  test('loads under the page-load budget @regression', async ({ dashboardPage }) => {
    await measure('dashboard load', ENV.PERF.pageLoadMs, async () => {
      await dashboardPage.open();
      await dashboardPage.expectLoaded();
    });
  });

  test('no broken images, no stuck loader @regression', async ({ dashboardPage, page }) => {
    await dashboardPage.open();
    await dashboardPage.expectLoaded();
    await expectNoStuckLoader(page);
    await expectNoBrokenImages(page);
  });

  test('no console errors or failed APIs on load @regression', async ({
    dashboardPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await dashboardPage.open();
    await dashboardPage.expectLoaded();
    await assertClean(consoleMonitor, apiMonitor);
  });

  test('navigation timing + heap are within sane bounds @regression', async ({
    dashboardPage,
    page,
  }) => {
    await dashboardPage.open();
    await dashboardPage.expectLoaded();
    const metrics = await collectMetrics(page);
    expect(metrics.domContentLoadedMs).toBeGreaterThan(0);
    const heap = await jsHeapMB(page);
    if (heap !== null) expect(heap, 'JS heap should stay under 400MB').toBeLessThan(400);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────
  test('survives a slow analytics API response @regression', async ({ dashboardPage, page }) => {
    await page.route(/dashboard|stats|analytics|summary/i, async (route) => {
      await new Promise((r) => setTimeout(r, 1_500));
      await route.continue();
    });
    await dashboardPage.open();
    await dashboardPage.expectLoaded();
  });

  test('remains usable after a viewport resize @regression', async ({ dashboardPage, page }) => {
    await dashboardPage.open();
    await dashboardPage.expectLoaded();
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(dashboardPage.card(/total screens/i)).toBeVisible();
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(dashboardPage.card(/total screens/i)).toBeVisible();
  });
});
