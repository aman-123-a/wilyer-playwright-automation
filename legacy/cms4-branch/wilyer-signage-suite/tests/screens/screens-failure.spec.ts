// =============================================================================
//  3. Screens — API failure handling
// =============================================================================
import { test } from '../../fixtures/test';
import { API } from '../../config/routes';
import { withFailure } from '../../utils/apiMocks';
import { assertGracefulDegradation, assertNoWhiteScreen, assertCanRecover } from '../../utils/resilience';

test.describe('Screens · Failure', () => {
  test('screen API returns 500 → graceful error', async ({ screensPage, page }) => {
    await withFailure(page, API.screensList, 'http500', async () => {
      await screensPage.open().catch(() => {});
      await assertGracefulDegradation(page, 'screens 500');
      await assertCanRecover(page);
    });
  });

  test('screen API timeout → no white screen', async ({ screensPage, page }) => {
    await withFailure(page, API.screensList, 'timeout', async () => {
      await screensPage.open().catch(() => {});
      await assertNoWhiteScreen(page, 'screens timeout');
    }, { delayMs: 8000 });
  });

  test('null response is handled', async ({ screensPage, page }) => {
    await withFailure(page, API.screensList, 'nullBody', async () => {
      await screensPage.open().catch(() => {});
      await assertNoWhiteScreen(page, 'screens null');
    });
  });

  test('malformed JSON is handled', async ({ screensPage, page }) => {
    await withFailure(page, API.screensList, 'malformedJson', async () => {
      await screensPage.open().catch(() => {});
      await assertNoWhiteScreen(page, 'screens malformed');
    });
  });
});
