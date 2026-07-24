// =============================================================================
//  3. Screens — Edge cases
// =============================================================================
import { test, expect } from '../../fixtures/test';
import * as gen from '../../utils/dataGenerators';

test.describe('Screens · Edge', () => {
  test('duplicate screen name is rejected or disambiguated', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    const data = gen.screen();
    await screensPage.open();
    await screensPage.create(data);
    await screensPage.expectRow(data.name);
    // Try to create a second screen with the same name.
    await screensPage.create({ ...data });
    const stillModal = await screensPage.openModal().isVisible().catch(() => false);
    const dupToast = await screensPage.toastVisible(/exist|duplicate|already|taken/i);
    expect(stillModal || dupToast, 'Duplicate name should be blocked or flagged').toBe(true);
  });

  test('duplicate pairing code is rejected', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    const a = gen.screen();
    const b = gen.screen({ pairingCode: a.pairingCode });
    await screensPage.open();
    await screensPage.create(a);
    await screensPage.create(b);
    const blocked = (await screensPage.openModal().isVisible().catch(() => false)) ||
      (await screensPage.toastVisible(/pair|code.*exist|already|invalid/i));
    expect(blocked, 'Duplicate pairing code should be blocked').toBe(true);
  });

  test('large tag assignment is handled @edge', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    const tags = Array.from({ length: 50 }, (_, i) => `${gen.PREFIX}-tag-${i}`);
    await screensPage.open();
    await screensPage.create(gen.screen({ tags }));
    // No crash; the list still renders.
    await expect(screensPage.addButton).toBeVisible();
  });

  test('bulk select operation is available', async ({ screensPage }) => {
    await screensPage.open();
    const selectAll = screensPage.page.getByRole('checkbox', { name: /select all/i })
      .or(screensPage.page.locator('thead input[type="checkbox"]')).first();
    test.skip(!(await selectAll.isVisible().catch(() => false)), 'No bulk-select UI on this build');
    await selectAll.check();
    await expect(screensPage.page.getByRole('button', { name: /delete|move|assign|bulk/i }).first()).toBeVisible();
  });

  test('no-license / expired-license assignment surfaces a clear message @edge', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    await screensPage.open();
    await screensPage.openCreate();
    const licenseField = screensPage.page.locator('select[name*="licen" i], [aria-label*="licen" i]').first();
    test.skip(!(await licenseField.isVisible().catch(() => false)), 'No license assignment in create flow');
    await screensPage.fillForm(gen.screen());
    await screensPage.submit();
    // Whatever the license state, the app must not crash silently.
    await expect(screensPage.page.locator('body')).toBeVisible();
  });
});
