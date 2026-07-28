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
import { MediaSetsPage } from '../pages/MediaSetsPage';
import { ScreensPage } from '../pages/ScreensPage';
import { GroupsPage } from '../pages/GroupsPage';
import { PlaylistsPage } from '../pages/PlaylistsPage';
import { PlaylistEditorPage } from '../pages/PlaylistEditorPage';
import { ReportsPage } from '../pages/ReportsPage';
import { BillingPage } from '../pages/BillingPage';
import { TeamPage } from '../pages/TeamPage';
import { PrayerSchedulePage } from '../pages/PrayerSchedulePage';
import { CampaignPickerPage } from '../pages/CampaignPickerPage';
import { ConsoleMonitor } from '../utils/consoleMonitor';
import { ApiMonitor } from '../utils/apiMonitor';
import { CampaignApi } from '../utils/campaignApi';

interface Pages {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  libraryPage: LibraryPage;
  mediaSetsPage: MediaSetsPage;
  screensPage: ScreensPage;
  groupsPage: GroupsPage;
  playlistsPage: PlaylistsPage;
  playlistEditorPage: PlaylistEditorPage;
  reportsPage: ReportsPage;
  billingPage: BillingPage;
  teamPage: TeamPage;
  prayerSchedulePage: PrayerSchedulePage;
  campaignPicker: CampaignPickerPage;
}

interface Monitors {
  consoleMonitor: ConsoleMonitor;
  apiMonitor: ApiMonitor;
}

interface Clients {
  /** Campaign REST client bound to the authenticated browser session. */
  campaignApi: CampaignApi;
}

export const test = base.extend<Pages & Monitors & Clients>({
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

  mediaSetsPage: async ({ page }, use) => {
    await use(new MediaSetsPage(page));
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

  playlistEditorPage: async ({ page }, use) => {
    await use(new PlaylistEditorPage(page));
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

  prayerSchedulePage: async ({ page }, use) => {
    await use(new PrayerSchedulePage(page));
  },

  campaignPicker: async ({ page }, use) => {
    await use(new CampaignPickerPage(page));
  },

  // Reads the session JWT from the context's `footprint` cookie, so it is only
  // constructible after the storageState is applied — hence a fixture, not a
  // module-level singleton.
  campaignApi: async ({ context }, use) => {
    await use(await CampaignApi.fromContext(context));
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
