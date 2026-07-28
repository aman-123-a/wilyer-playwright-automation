// =============================================================================
//  Custom test fixtures — the single import every spec uses.
// =============================================================================
//  Provides:
//   • One instance of every page object (lazy, constructed per test).
//   • Passive console/5xx monitors attached + asserted in teardown.
//   • `destructive` guard helper so write tests soft-skip when not allowed.
//   • `login` fixture for specs that start logged-out (auth/security).
// =============================================================================
import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { SignInPage } from '../pages/SignInPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { SignUpPage } from '../pages/SignUpPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ScreensPage } from '../pages/ScreensPage';
import { ScreenDetailPage } from '../pages/ScreenDetailPage';
import { GroupsPage } from '../pages/GroupsPage';
import { ClustersPage } from '../pages/ClustersPage';
import { LibraryPage } from '../pages/LibraryPage';
import { PlaylistPage } from '../pages/PlaylistPage';
import { RolloutsPage } from '../pages/RolloutsPage';
import { TeamPage } from '../pages/TeamPage';
import { ReportsPage } from '../pages/ReportsPage';
import { AccountSettingsPage } from '../pages/AccountSettingsPage';
import { attachMonitors, type Monitor } from '../utils/monitors';
import { ENV } from '../config/env';

interface Pages {
  loginPage: LoginPage;
  signInPage: SignInPage;
  forgotPasswordPage: ForgotPasswordPage;
  signUpPage: SignUpPage;
  dashboardPage: DashboardPage;
  screensPage: ScreensPage;
  screenDetailPage: ScreenDetailPage;
  groupsPage: GroupsPage;
  clustersPage: ClustersPage;
  libraryPage: LibraryPage;
  playlistPage: PlaylistPage;
  rolloutsPage: RolloutsPage;
  teamPage: TeamPage;
  reportsPage: ReportsPage;
  accountPage: AccountSettingsPage;
}

interface Helpers {
  monitor: Monitor;
  /** Soft-skip the test when CMS_ALLOW_DESTRUCTIVE is not set. */
  requireDestructive: () => void;
}

export const test = base.extend<Pages & Helpers>({
  // ── Monitors run for every test, asserted on teardown ─────────────────────
  monitor: async ({ page }, use, testInfo) => {
    const m = attachMonitors(page);
    await use(m);
    m.assert(testInfo);
  },

  requireDestructive: async ({}, use, testInfo) => {
    use(() => {
      testInfo.skip(!ENV.ALLOW_DESTRUCTIVE, 'CMS_ALLOW_DESTRUCTIVE not enabled — skipping mutation test');
    });
  },

  // ── Page objects ──────────────────────────────────────────────────────────
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  signInPage: async ({ page }, use) => use(new SignInPage(page)),
  forgotPasswordPage: async ({ page }, use) => use(new ForgotPasswordPage(page)),
  signUpPage: async ({ page }, use) => use(new SignUpPage(page)),
  dashboardPage: async ({ page }, use) => use(new DashboardPage(page)),
  screensPage: async ({ page }, use) => use(new ScreensPage(page)),
  screenDetailPage: async ({ page }, use) => use(new ScreenDetailPage(page)),
  groupsPage: async ({ page }, use) => use(new GroupsPage(page)),
  clustersPage: async ({ page }, use) => use(new ClustersPage(page)),
  libraryPage: async ({ page }, use) => use(new LibraryPage(page)),
  playlistPage: async ({ page }, use) => use(new PlaylistPage(page)),
  rolloutsPage: async ({ page }, use) => use(new RolloutsPage(page)),
  teamPage: async ({ page }, use) => use(new TeamPage(page)),
  reportsPage: async ({ page }, use) => use(new ReportsPage(page)),
  accountPage: async ({ page }, use) => use(new AccountSettingsPage(page)),
});

export { expect };
export { ENV };
