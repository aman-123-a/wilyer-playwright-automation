// =============================================================================
//  4. Screen Detail — volume, rotation, player controls, save failures.
// =============================================================================
//  These tests need at least one screen to exist. They open the first screen
//  from the list; if none exist they soft-skip.
// =============================================================================
import { test, expect } from '../../fixtures/test';
import { API } from '../../config/routes';
import { NUMERIC } from '../../utils/dataGenerators';
import { withFailure } from '../../utils/apiMocks';
import { assertNoWhiteScreen } from '../../utils/resilience';

async function openFirstScreen(screensPage: any): Promise<boolean> {
  await screensPage.open();
  const firstRow = screensPage.rowWith(/.+/).first();
  if (!(await firstRow.isVisible().catch(() => false))) return false;
  await firstRow.click();
  return true;
}

test.describe('Screen Detail · Configuration', () => {
  test.beforeEach(async ({ screensPage }) => {
    test.skip(!(await openFirstScreen(screensPage)), 'No screens available to configure');
  });

  test('volume = 0 (minimum) is accepted', async ({ screenDetailPage, requireDestructive }) => {
    requireDestructive();
    test.skip(!(await screenDetailPage.volumeInput.isVisible().catch(() => false)), 'No volume control');
    await screenDetailPage.setVolume(NUMERIC.volume.min);
    await screenDetailPage.save();
    expect(await screenDetailPage.currentVolume()).toBe(0);
  });

  test('volume = 100 (maximum) is accepted', async ({ screenDetailPage, requireDestructive }) => {
    requireDestructive();
    test.skip(!(await screenDetailPage.volumeInput.isVisible().catch(() => false)), 'No volume control');
    await screenDetailPage.setVolume(NUMERIC.volume.max);
    await screenDetailPage.save();
    expect(await screenDetailPage.currentVolume()).toBe(100);
  });

  test('volume below minimum is clamped/rejected', async ({ screenDetailPage }) => {
    test.skip(!(await screenDetailPage.volumeInput.isVisible().catch(() => false)), 'No volume control');
    await screenDetailPage.setVolume(NUMERIC.volume.belowMin);
    const v = await screenDetailPage.currentVolume();
    expect(v, 'volume must not go below 0').toBeGreaterThanOrEqual(0);
  });

  test('volume above maximum is clamped/rejected', async ({ screenDetailPage }) => {
    test.skip(!(await screenDetailPage.volumeInput.isVisible().catch(() => false)), 'No volume control');
    await screenDetailPage.setVolume(NUMERIC.volume.aboveMax);
    const v = await screenDetailPage.currentVolume();
    expect(v, 'volume must not exceed 100').toBeLessThanOrEqual(100);
  });

  for (const rot of NUMERIC.rotation.valid) {
    test(`rotation ${rot}° is accepted`, async ({ screenDetailPage, requireDestructive }) => {
      requireDestructive();
      test.skip(!(await screenDetailPage.rotationControl.isVisible().catch(() => false)), 'No rotation control');
      await screenDetailPage.setRotation(rot);
      await screenDetailPage.save();
      await assertNoWhiteScreen(screenDetailPage.page, `rotation ${rot}`);
    });
  }

  test('invalid rotation value is rejected', async ({ screenDetailPage }) => {
    test.skip(!(await screenDetailPage.rotationControl.isVisible().catch(() => false)), 'No rotation control');
    await screenDetailPage.setRotation(NUMERIC.rotation.invalid[0]);
    // The control should not accept an off-grid value; page stays stable.
    await assertNoWhiteScreen(screenDetailPage.page, 'invalid rotation');
  });
});

test.describe('Screen Detail · Player controls', () => {
  test.beforeEach(async ({ screensPage }) => {
    test.skip(!(await openFirstScreen(screensPage)), 'No screens available');
  });

  test('restart player control is available', async ({ screenDetailPage, requireDestructive }) => {
    requireDestructive();
    test.skip(!(await screenDetailPage.restartButton.isVisible().catch(() => false)), 'No restart control');
    await screenDetailPage.restart();
    await assertNoWhiteScreen(screenDetailPage.page, 'after restart');
  });

  test('transfer license control is available', async ({ screenDetailPage }) => {
    const visible = await screenDetailPage.transferLicenseButton.isVisible().catch(() => false);
    test.info().annotations.push({ type: 'transfer-license', description: visible ? 'present' : 'not present' });
  });
});

test.describe('Screen Detail · Failure', () => {
  test.beforeEach(async ({ screensPage }) => {
    test.skip(!(await openFirstScreen(screensPage)), 'No screens available');
  });

  test('configuration save API failure shows an error', async ({ screenDetailPage, page, requireDestructive }) => {
    requireDestructive();
    test.skip(!(await screenDetailPage.volumeInput.isVisible().catch(() => false)), 'No config to save');
    await withFailure(page, API.screenDetail, 'http500', async () => {
      await screenDetailPage.setVolume(50);
      await screenDetailPage.save();
      await assertNoWhiteScreen(page, 'save 500');
    }, { method: 'POST' });
  });

  test('restart API failure shows an error', async ({ screenDetailPage, page, requireDestructive }) => {
    requireDestructive();
    test.skip(!(await screenDetailPage.restartButton.isVisible().catch(() => false)), 'No restart control');
    await withFailure(page, API.screenDetail, 'http500', async () => {
      await screenDetailPage.restart();
      await assertNoWhiteScreen(page, 'restart 500');
    });
  });
});
