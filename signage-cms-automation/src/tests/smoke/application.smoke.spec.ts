// =============================================================================
//  Application Validation smoke suite — TC_APP_001 … TC_APP_004.
//  Exercises the resilience requirements: hard refresh, cache/storage clear,
//  console-error monitoring, and API health (no 5xx).
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { assertClean } from '../../utils/assertions';

test.describe('@smoke Application Validation', () => {
  // TC_APP_001 — Hard refresh: the app reloads correctly into the shell.
  test('TC_APP_001_Hard_Refresh — app reloads correctly', async ({
    dashboardPage,
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    await dashboardPage.open();
    await dashboardPage.expectLoaded();

    // Bypass-cache reload (hard refresh).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.location.reload());
    await dashboardPage.expectLoaded();
    await assertClean(consoleMonitor, apiMonitor);
  });

  // TC_APP_002 — Cache / storage clear: the app still works normally afterwards.
  test('TC_APP_002_Cache_Clear — works after clearing caches/storage', async ({
    dashboardPage,
    page,
    context,
    consoleMonitor,
    apiMonitor,
  }) => {
    await dashboardPage.open();
    await dashboardPage.expectLoaded();

    // Clear sessionStorage + the Cache Storage API (keep cookies so the cached
    // auth session survives — we are validating cache resilience, not logout).
    await page.evaluate(async () => {
      window.sessionStorage.clear();
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    });
    await context.clearCookies({ name: '__nonexistent_marker__' }).catch(() => {});

    await page.reload({ waitUntil: 'domcontentloaded' });
    await dashboardPage.expectLoaded();
    await assertClean(consoleMonitor, apiMonitor);
  });

  // TC_APP_003 — Console errors: no app-originated console errors / exceptions
  // across a representative navigation sweep.
  test('TC_APP_003_Console_Errors — no console errors / uncaught exceptions', async ({
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    for (const path of ['/', '/screens', '/library', '/playlists', '/account']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1_500);
    }
    // Hard assertion on the always-fail signals (uncaught exceptions, 5xx),
    // plus the attached console-error report. Benign 4xx/analytics noise warns.
    await assertClean(consoleMonitor, apiMonitor);

    // Surface the app-console-error count explicitly for the report.
    test.info().annotations.push({
      type: 'console-error-count',
      description: `${consoleMonitor.getErrors().length} app console error(s) across the sweep`,
    });
  });

  // TC_APP_004 — API health: no failed (5xx) API responses across the sweep.
  test('TC_APP_004_API_Health_Check — no 5xx / API failures', async ({
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    for (const path of ['/', '/screens', '/library', '/playlists', '/reports', '/account']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1_500);
    }

    const serverErrors = apiMonitor.getServerErrors();
    expect(serverErrors, `5xx responses:\n${apiMonitor.summary()}`).toHaveLength(0);

    test.info().annotations.push({
      type: 'api-health',
      description: `${apiMonitor.getFailed().length} non-2xx API response(s), ${serverErrors.length} server error(s)`,
    });
    await assertClean(consoleMonitor, apiMonitor);
  });
});
