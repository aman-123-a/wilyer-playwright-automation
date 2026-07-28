// =============================================================================
//  BILLING MODULE — smoke coverage of plans, tabs, and capability checks.
//  Runs authenticated. Read-only — no purchases are made.
// =============================================================================

import { test, expect } from '../../../fixtures/test-fixtures';
import { ENV } from '../../../config/env';
import { assertClean } from '../../../utils/assertions';
import { measure } from '../../../utils/performance';

test.describe('Billing', () => {
  // The Billing module is not deployed on every build: on live the /billing
  // route falls back to rendering the Dashboard while the URL stays /billing.
  // Skip the module there rather than reporting four false failures.
  test.beforeEach(async ({ billingPage }) => {
    test.skip(
      !(await billingPage.isAvailable()),
      'Billing module is not deployed on this build (/billing renders the Dashboard)',
    );
  });

  test('billing page loads with plans or an empty state @smoke @sanity @regression', async ({
    billingPage,
  }) => {
    await billingPage.open();
    await billingPage.expectPlansLoaded();
  });

  test('My Plans / Buy Plan / My Purchases tabs are present @regression', async ({
    billingPage,
  }) => {
    await billingPage.open();
    await expect(billingPage.myPlansTab).toBeVisible();
    await expect(billingPage.buyPlanTab).toBeVisible();
    await expect(billingPage.myPurchasesTab).toBeVisible();
  });

  test('switching to Buy Plan works @regression', async ({ billingPage }) => {
    await billingPage.open();
    await billingPage.openTab('buy');
  });

  test('loads within budget, clean console/API @regression', async ({
    billingPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await measure('billing load', ENV.PERF.pageLoadMs, async () => {
      await billingPage.open();
      await billingPage.expectPlansLoaded();
    });
    await assertClean(consoleMonitor, apiMonitor);
  });
});
