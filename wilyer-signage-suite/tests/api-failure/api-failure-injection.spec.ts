// =============================================================================
//  14. API Failure Injection — the cross-cutting resilience matrix.
// =============================================================================
//  For each major module route × each failure scenario, assert the app:
//    • shows no white screen
//    • shows no React crash
//    • keeps the shell so the user can recover
//  This is the suite's strongest signal because it needs no module-specific
//  selectors — it exercises the exact failure mode the project cares about.
// =============================================================================
import { test } from '../../fixtures/test';
import { ROUTES, API } from '../../config/routes';
import { withFailure, type Scenario } from '../../utils/apiMocks';
import { assertNoWhiteScreen, assertNoReactCrash, assertCanRecover, waitForAppSettled } from '../../utils/resilience';

// This suite drives a single admin account hard; the app rate-limits parallel
// hits from one account. Run it with `--workers=1` for stability. We do NOT use
// describe-level `serial` mode here, so one real finding never cascades into a
// wall of "did not run" for the rest of the matrix.

const TARGETS: { name: string; route: string; api: string }[] = [
  { name: 'dashboard', route: ROUTES.dashboard, api: API.dashboardStats },
  { name: 'screens', route: ROUTES.screens, api: API.screensList },
  { name: 'groups', route: ROUTES.groups, api: API.groups },
  { name: 'clusters', route: ROUTES.clusters, api: API.clusters },
  { name: 'library', route: ROUTES.library, api: API.library },
  { name: 'playlists', route: ROUTES.playlists, api: API.playlists },
  { name: 'rollouts', route: ROUTES.rollouts, api: API.rollouts },
  { name: 'reports', route: ROUTES.reports, api: API.reports },
];

// Read-path scenarios that should always degrade gracefully on page load.
const READ_SCENARIOS: Scenario[] = ['http500', 'http404', 'http401', 'timeout', 'emptyArray', 'nullBody', 'malformedJson', 'networkError'];

for (const target of TARGETS) {
  test.describe(`API failure · ${target.name}`, () => {
    for (const scenario of READ_SCENARIOS) {
      test(`${scenario} → graceful (no white screen / no crash)`, async ({ page }) => {
        await withFailure(
          page,
          target.api,
          scenario,
          async () => {
            await page.goto(target.route, { waitUntil: 'domcontentloaded' }).catch(() => {});
            await waitForAppSettled(page); // wait for shell/error/content, not a fixed delay
            await assertNoWhiteScreen(page, `${target.name} ${scenario}`);
            await assertNoReactCrash(page, `${target.name} ${scenario}`);
            await assertCanRecover(page);
          },
          { delayMs: 6000 },
        );
      });
    }
  });
}
