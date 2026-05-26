// =============================================================================
//  Central test fixtures. Every spec imports `test` + `expect` from here.
//  Provides:
//   • Page objects (login, dashboard, library) constructed per test.
//   • console + API monitors auto-attached to the page from the first action.
//   • Automatic artifact attachment of monitor summaries when a test fails.
//  Authenticated state comes from the project's storageState (cached session),
//  so tests start already logged in — except auth.spec.ts which clears it.
// =============================================================================

import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { LibraryPage } from '../pages/LibraryPage';
import { ScreensPage } from '../pages/ScreensPage';
import { GroupsPage } from '../pages/GroupsPage';
import { PlaylistsPage } from '../pages/PlaylistsPage';
import { ReportsPage } from '../pages/ReportsPage';
import { BillingPage } from '../pages/BillingPage';
import { TeamPage } from '../pages/TeamPage';
import { ConsoleMonitor } from '../utils/consoleMonitor';
import { ApiMonitor } from '../utils/apiMonitor';

interface Pages {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  libraryPage: LibraryPage;
  screensPage: ScreensPage;
  groupsPage: GroupsPage;
  playlistsPage: PlaylistsPage;
  reportsPage: ReportsPage;
  billingPage: BillingPage;
  teamPage: TeamPage;
}

interface Monitors {
  consoleMonitor: ConsoleMonitor;
  apiMonitor: ApiMonitor;
}

export const test = base.extend<Pages & Monitors>({
  // Monitors attach at page creation so they capture the whole test.
  consoleMonitor: async ({ page }, use) => {
    const monitor = new ConsoleMonitor(page);
    await use(monitor);
  },

  apiMonitor: async ({ page }, use) => {
    const monitor = new ApiMonitor(page);
    await use(monitor);
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  libraryPage: async ({ page }, use) => {
    await use(new LibraryPage(page));
  },

  screensPage: async ({ page }, use) => {
    await use(new ScreensPage(page));
  },

  groupsPage: async ({ page }, use) => {
    await use(new GroupsPage(page));
  },

  playlistsPage: async ({ page }, use) => {
    await use(new PlaylistsPage(page));
  },

  reportsPage: async ({ page }, use) => {
    await use(new ReportsPage(page));
  },

  billingPage: async ({ page }, use) => {
    await use(new BillingPage(page));
  },

  teamPage: async ({ page }, use) => {
    await use(new TeamPage(page));
  },
});

// On failure, attach whatever the monitors captured for fast triage.
test.afterEach(async ({ consoleMonitor, apiMonitor }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('console-errors', {
      body: consoleMonitor.summary(),
      contentType: 'text/plain',
    });
    await testInfo.attach('api-activity', {
      body: apiMonitor.summary(),
      contentType: 'text/plain',
    });
  }
});

export { expect };
