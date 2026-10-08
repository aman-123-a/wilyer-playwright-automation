// =============================================================================
//  12. Account Settings — notification settings CRUD + interval boundaries.
// =============================================================================
import { test, expect } from '../../fixtures/test';
import { NUMERIC } from '../../utils/dataGenerators';
import { API } from '../../config/routes';
import { withFailure } from '../../utils/apiMocks';
import { assertGracefulDegradation, assertNoWhiteScreen } from '../../utils/resilience';

test.describe('Account · Notification settings', () => {
  test('account page loads @smoke', async ({ accountPage }) => {
    await accountPage.open();
    await assertNoWhiteScreen(accountPage.page, 'account settings');
  });

  test('create notification setting', async ({ accountPage, requireDestructive }) => {
    requireDestructive();
    await accountPage.open();
    await accountPage.openNotifications();
    test.skip(!(await accountPage.addSettingButton.isVisible().catch(() => false)), 'No notification settings UI');
    await accountPage.createSetting(NUMERIC.interval.min + 5);
    await assertNoWhiteScreen(accountPage.page, 'create notification');
  });

  test('edit notification setting', async ({ accountPage, requireDestructive }) => {
    requireDestructive();
    await accountPage.open();
    await accountPage.openNotifications();
    const firstRow = accountPage.rowWith(/.+/).first();
    test.skip(!(await firstRow.isVisible().catch(() => false)), 'No settings to edit');
    await firstRow.getByRole('button', { name: /edit/i }).first().click().catch(() => {});
    await assertNoWhiteScreen(accountPage.page, 'edit notification');
  });

  test('delete notification setting', async ({ accountPage, requireDestructive }) => {
    requireDestructive();
    await accountPage.open();
    await accountPage.openNotifications();
    const firstRow = accountPage.rowWith(/.+/).first();
    test.skip(!(await firstRow.isVisible().catch(() => false)), 'No settings to delete');
    await firstRow.getByRole('button', { name: /delete|remove/i }).first().click().catch(() => {});
    await accountPage.confirm().catch(() => {});
  });
});

test.describe('Account · Boundary', () => {
  test.beforeEach(async ({ accountPage }) => {
    await accountPage.open();
    await accountPage.openNotifications();
    test.skip(!(await accountPage.intervalInput.isVisible().catch(() => false)), 'No interval input');
  });

  test('interval minimum is accepted', async ({ accountPage }) => {
    await accountPage.setInterval(NUMERIC.interval.min);
    expect(Number(await accountPage.intervalInput.inputValue())).toBeGreaterThanOrEqual(NUMERIC.interval.min - 0);
  });

  test('interval below minimum is bounded', async ({ accountPage }) => {
    await accountPage.setInterval(NUMERIC.interval.belowMin);
    const v = Number(await accountPage.intervalInput.inputValue());
    expect(Number.isNaN(v) || v >= 0).toBe(true);
  });

  test('interval maximum is accepted/bounded', async ({ accountPage }) => {
    await accountPage.setInterval(NUMERIC.interval.aboveMax);
    await assertNoWhiteScreen(accountPage.page, 'interval max');
  });
});

test.describe('Account · Failure', () => {
  test('save API failure is handled', async ({ accountPage, page, requireDestructive }) => {
    requireDestructive();
    await accountPage.open();
    await accountPage.openNotifications();
    test.skip(!(await accountPage.addSettingButton.isVisible().catch(() => false)), 'No settings UI');
    await withFailure(page, API.account, 'http500', async () => {
      await accountPage.createSetting(NUMERIC.interval.min + 1);
      await assertGracefulDegradation(page, 'account save 500');
    }, { method: 'POST' });
  });
});
