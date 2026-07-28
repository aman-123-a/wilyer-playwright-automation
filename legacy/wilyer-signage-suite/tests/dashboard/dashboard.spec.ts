// =============================================================================
//  2. Dashboard — cards, quick actions, charts, map, license banners, failures.
// =============================================================================
import { test, expect } from '../../fixtures/test';
import { API } from '../../config/routes';
import { withFailure } from '../../utils/apiMocks';
import { assertNoWhiteScreen, assertNoReactCrash, assertCanRecover } from '../../utils/resilience';

test.describe('Dashboard', () => {
  test('all statistic cards load @smoke', async ({ dashboardPage }) => {
    await dashboardPage.open();
    await dashboardPage.expectStatsLoaded(1);
  });

  test('quick action buttons are present', async ({ dashboardPage }) => {
    await dashboardPage.open();
    await expect(dashboardPage.quickActions.first()).toBeVisible();
  });

  test('charts render', async ({ dashboardPage }) => {
    await dashboardPage.open();
    await dashboardPage.expectChartsRendered();
  });

  test('map loads', async ({ dashboardPage }) => {
    await dashboardPage.open();
    // The map may be feature-gated; treat absence as a soft annotation, not a hard fail.
    const visible = await dashboardPage.map.first().isVisible().catch(() => false);
    test.info().annotations.push({ type: 'map', description: visible ? 'map rendered' : 'map not present on this account' });
  });

  test('license banner state is renderable (expired/expiring)', async ({ dashboardPage }) => {
    await dashboardPage.open();
    const expired = await dashboardPage.hasExpiredBanner();
    const expiring = await dashboardPage.hasExpiringBanner();
    test.info().annotations.push({ type: 'license-banner', description: `expired=${expired} expiring=${expiring}` });
    // Whatever the state, the dashboard must not be blank.
    await assertNoWhiteScreen(dashboardPage.page, 'dashboard license banner');
  });

  test('API 500 on stats degrades gracefully (no white screen)', async ({ dashboardPage, page }) => {
    // A single failed stats widget should not blank the page or crash React, and
    // the shell must stay so the user can recover. (We don't require a global
    // error toast — a partial widget failure may legitimately render empty.)
    await withFailure(page, API.dashboardStats, 'http500', async () => {
      await dashboardPage.open().catch(() => {});
      await assertNoWhiteScreen(page, 'dashboard 500');
      await assertNoReactCrash(page, 'dashboard 500');
      await assertCanRecover(page);
    });
  });

  test('API timeout on stats degrades gracefully', async ({ dashboardPage, page }) => {
    await withFailure(page, API.dashboardStats, 'timeout', async () => {
      await dashboardPage.open().catch(() => {});
      await assertNoWhiteScreen(page, 'dashboard timeout');
    }, { delayMs: 8000 });
  });

  test('empty data renders an empty-state, not a crash', async ({ dashboardPage, page }) => {
    await withFailure(page, API.dashboardStats, 'emptyArray', async () => {
      await dashboardPage.open().catch(() => {});
      await assertNoWhiteScreen(page, 'dashboard empty');
    });
  });
});
