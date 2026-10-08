// =============================================================================
//  ACCESSIBILITY — axe-core WCAG 2.0/2.1 A & AA scans of key authenticated
//  surfaces. Fails only on serious/critical violations; the full report is
//  attached for review. Runs authenticated via the cached admin session.
// =============================================================================

import { test } from '../../../../fixtures/test-fixtures';
import { checkA11y } from '../../../../utils/accessibility';

test.describe('Accessibility', () => {
  test('dashboard has no serious/critical a11y violations @regression', async ({
    dashboardPage,
    page,
  }) => {
    await dashboardPage.open();
    await dashboardPage.expectLoaded();
    await checkA11y(page);
  });

  test('library has no serious/critical a11y violations @regression', async ({
    libraryPage,
    page,
  }) => {
    await libraryPage.open();
    await libraryPage.expectGridLoaded();
    await checkA11y(page);
  });
});
