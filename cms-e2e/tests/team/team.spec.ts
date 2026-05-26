// =============================================================================
//  TEAM MODULE — smoke coverage of members table, tabs, and search.
//  Runs authenticated. Read-only — no members are created/removed.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { ENV } from '../../config/env';
import { assertClean, expectNoStuckLoader } from '../../utils/assertions';
import { measure } from '../../utils/performance';

test.describe('Team', () => {
  test('members table loads with rows or an empty state @smoke @sanity @regression', async ({
    teamPage,
  }) => {
    await teamPage.open();
    await teamPage.expectMembersLoaded();
  });

  test('Members / Roles / Logs tabs are present @regression', async ({ teamPage }) => {
    await teamPage.open();
    await expect(teamPage.membersTab).toBeVisible();
    await expect(teamPage.rolesTab).toBeVisible();
    await expect(teamPage.logsTab).toBeVisible();
  });

  test('switching to Roles works @regression', async ({ teamPage }) => {
    await teamPage.open();
    await teamPage.openRoles();
  });

  test('search narrows the members table or yields an empty state @regression', async ({
    teamPage,
    page,
  }) => {
    await teamPage.open();
    await teamPage.expectMembersLoaded();
    await teamPage.searchMembers(`zz-no-such-member-${Date.now()}`);
    await expect.poll(() => teamPage.rowCount(), { timeout: 15_000 }).toBe(0);
    await expectNoStuckLoader(page);
  });

  test('loads within budget, clean console/API @regression', async ({
    teamPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await measure('team load', ENV.PERF.pageLoadMs, async () => {
      await teamPage.open();
      await teamPage.expectMembersLoaded();
    });
    await assertClean(consoleMonitor, apiMonitor);
  });
});
