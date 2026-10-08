// =============================================================================
//  Regression — cross-module navigation & dashboard integrity.
//  The regression tier holds deeper, longer-running checks; this seed spec
//  verifies every primary module is reachable from the shell and renders its
//  listing/empty-state without console/server errors. Extend this folder with
//  data-driven and edge-case coverage as the suite grows.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { assertClean, expectNoStuckLoader } from '../../utils/assertions';

const MODULES: Array<{ path: string; ready: RegExp }> = [
  { path: '/', ready: /dashboard/i },
  { path: '/screens', ready: /all screens/i },
  { path: '/library', ready: /library/i },
  { path: '/playlists', ready: /new playlist/i },
  { path: '/reports', ready: /report/i },
  { path: '/account', ready: /account|profile/i },
];

test.describe('@regression Cross-module navigation', () => {
  for (const mod of MODULES) {
    test(`module "${mod.path}" loads cleanly`, async ({ page, consoleMonitor, apiMonitor }) => {
      await page.goto(mod.path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(mod.ready).first()).toBeVisible({ timeout: 20_000 });
      await expectNoStuckLoader(page);
      // Shell intact (sidebar dashboard link present) on every module.
      await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible();
      await assertClean(consoleMonitor, apiMonitor);
    });
  }
});
