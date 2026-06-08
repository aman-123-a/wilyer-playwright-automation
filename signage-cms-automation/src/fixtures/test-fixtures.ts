// =============================================================================
//  Central test fixtures. Every spec imports `test` + `expect` from here.
//  Provides:
//   • Page objects (login, dashboard, playlist, media, screen, account) per test.
//   • console + API monitors auto-attached from the first action of the test.
//   • Automatic "before execution" + "after execution" screenshots attached to
//     the report, plus monitor summaries attached on failure (in addition to
//     Playwright's automatic on-failure screenshot / video / trace).
//
//  Authenticated state comes from the project's storageState (cached admin
//  session written by helpers/auth.setup.ts), so smoke tests start logged in —
//  this is the "reusable login fixture so all smoke tests authenticate
//  automatically" requirement.
// =============================================================================

import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { PlaylistPage } from '../pages/PlaylistPage';
import { MediaPage } from '../pages/MediaPage';
import { ScreenPage } from '../pages/ScreenPage';
import { AccountPage } from '../pages/AccountPage';
import { ConsoleMonitor } from '../utils/consoleMonitor';
import { ApiMonitor } from '../utils/apiMonitor';
import { captureAndAttach } from '../helpers/screenshot';

interface Pages {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  playlistPage: PlaylistPage;
  mediaPage: MediaPage;
  screenPage: ScreenPage;
  accountPage: AccountPage;
}

interface Monitors {
  consoleMonitor: ConsoleMonitor;
  apiMonitor: ApiMonitor;
}

export const test = base.extend<Pages & Monitors>({
  // Monitors attach at page creation so they capture the whole test.
  // `auto` so they exist even if a spec doesn't reference them directly.
  consoleMonitor: [
    async ({ page }, use) => {
      await use(new ConsoleMonitor(page));
    },
    { auto: true },
  ],

  apiMonitor: [
    async ({ page }, use) => {
      await use(new ApiMonitor(page));
    },
    { auto: true },
  ],

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  playlistPage: async ({ page }, use) => {
    await use(new PlaylistPage(page));
  },
  mediaPage: async ({ page }, use) => {
    await use(new MediaPage(page));
  },
  screenPage: async ({ page }, use) => {
    await use(new ScreenPage(page));
  },
  accountPage: async ({ page }, use) => {
    await use(new AccountPage(page));
  },
});

// "Screenshot before execution" — first frame once the page exists.
test.beforeEach(async ({ page }) => {
  await captureAndAttach(page, 'before-execution');
});

// "Screenshot after execution" + monitor summaries (always attach the after
// frame; attach monitor logs only when the test did not pass, for fast triage).
test.afterEach(async ({ page, consoleMonitor, apiMonitor }, testInfo) => {
  await captureAndAttach(page, 'after-execution');
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('console-errors', { body: consoleMonitor.summary(), contentType: 'text/plain' });
    await testInfo.attach('api-activity', { body: apiMonitor.summary(), contentType: 'text/plain' });
  }
});

export { expect };
