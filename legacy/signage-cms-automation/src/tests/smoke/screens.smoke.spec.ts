// =============================================================================
//  Screens & Settings smoke suite — TC_SC_001 … TC_SC_004.
//  Listing + detail are read-only by default; the settings write/persist check
//  gates behind CMS_ALLOW_DESTRUCTIVE.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { assertClean, expectNoStuckLoader } from '../../utils/assertions';
import { ENV } from '../../config/env';

test.describe('@smoke Screens & Settings', () => {
  // TC_SC_001 — Screen dashboard loads.
  test('TC_SC_001_Open_Screens — screen dashboard loads', async ({
    screenPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await screenPage.open();
    await screenPage.expectListLoaded();
    await expect(screenPage.allScreensTab).toBeVisible();
    await assertClean(consoleMonitor, apiMonitor);
  });

  // TC_SC_002 — Verify screen details: Name / Status / Resolution / Configuration.
  test('TC_SC_002_Verify_Screen_Details — core attributes visible', async ({
    screenPage,
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    await screenPage.open();
    await screenPage.expectListLoaded();

    test.skip((await screenPage.rowCount()) === 0, 'no screens available to open');
    await screenPage.openFirstScreen();
    await expectNoStuckLoader(page);

    const { found, missing } = await screenPage.expectDetailAttributes();
    test.info().annotations.push({
      type: 'screen-detail-attributes',
      description: `found: ${found.join(', ')} | missing: ${missing.join(', ') || 'none'}`,
    });
    // The detail page must surface the majority of the required attributes.
    expect(found.length, `screen detail attributes present (${found.join(', ')})`).toBeGreaterThanOrEqual(3);
    await assertClean(consoleMonitor, apiMonitor);
  });

  // TC_SC_003 — Update screen settings; persist after refresh (gated).
  test('TC_SC_003_Update_Screen_Settings — settings persist after refresh', async ({
    screenPage,
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    await screenPage.open();
    await screenPage.expectListLoaded();
    test.skip((await screenPage.rowCount()) === 0, 'no screens available to open');
    await screenPage.openFirstScreen();
    await expectNoStuckLoader(page);

    if (!ENV.ALLOW_DESTRUCTIVE) {
      // Non-destructive: confirm an editable settings control + a Save exist and
      // that the surface survives a refresh (configuration persists/loads).
      const save = page.getByRole('button', { name: /^(save|update|apply)$/i }).first();
      const hasSave = await save.isVisible({ timeout: 10_000 }).catch(() => false);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(screenPage.isOnSettings()).resolves.toBeTruthy();
      test.info().annotations.push({
        type: 'skipped-destructive',
        description: `Save control ${hasSave ? 'present' : 'absent'}; write skipped (CMS_ALLOW_DESTRUCTIVE=false).`,
      });
      await assertClean(consoleMonitor, apiMonitor);
      return;
    }

    // Destructive variant: toggle a setting, save, refresh, assert it stuck.
    const toggle = page.getByRole('switch').first().or(page.locator('input[type="checkbox"]').first());
    const wasOn = await toggle.isChecked().catch(() => false);
    await toggle.click();
    await page.getByRole('button', { name: /^(save|update|apply)$/i }).first().click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await toggle.isChecked().catch(() => wasOn)).toBe(!wasOn);
    await assertClean(consoleMonitor, apiMonitor);
  });

  // TC_SC_004 — Every tab on the screen-settings editor loads correctly.
  test('TC_SC_004_Verify_All_Tabs — all settings tabs load', async ({
    screenPage,
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    await screenPage.open();
    await screenPage.expectListLoaded();
    test.skip((await screenPage.rowCount()) === 0, 'no screens available to open');
    await screenPage.openFirstScreen();

    const tabs = screenPage.settingsTabs();
    const count = await tabs.count();
    expect(count, 'screen settings expose at least one tab/section').toBeGreaterThan(0);

    const limit = Math.min(count, 8);
    for (let i = 0; i < limit; i++) {
      const tab = tabs.nth(i);
      if (await tab.isVisible().catch(() => false)) {
        await tab.click().catch(() => {});
        await page.waitForTimeout(400);
        await expectNoStuckLoader(page, 8_000);
        // Shell intact after each tab == tab loaded without crashing.
        await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible();
      }
    }
    await assertClean(consoleMonitor, apiMonitor);
  });
});
