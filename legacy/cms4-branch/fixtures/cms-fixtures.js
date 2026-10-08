// =============================================================================
//  CMS test fixtures.
// =============================================================================
//  Extends Playwright's `test` with:
//    • consoleMon   — ConsoleMonitor attached from page creation
//    • apiMon       — ApiMonitor attached from page creation
//    • adminPage    — a page already logged in as admin
//    • subuserPage  — a page already logged in as the scoped sub-user
//    • pageObjects  — lazily-constructed POM accessors
//
//  Auto-teardown checks: every test that uses these fixtures gets console-error
//  and unexpected-5xx monitoring "for free". In STRICT_MONITORS mode the checks
//  FAIL the test; otherwise they warn. Tests that intentionally inject errors
//  (mock suites) opt out with `test.use({ strictMonitors: false })` or by
//  reading the monitors directly.
//
//  Import in specs:  import { test, expect } from '../../fixtures/cms-fixtures.js';
// =============================================================================

import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from '../utils/cms/env.js';
import { ConsoleMonitor } from '../utils/cms/consoleMonitor.js';
import { ApiMonitor } from '../utils/cms/apiMonitor.js';
import { login } from '../helpers/loginHelper.js';
import { LoginPage } from '../pages/cms/LoginPage.js';
import { DashboardPage } from '../pages/cms/DashboardPage.js';
import { LibraryPage } from '../pages/cms/LibraryPage.js';
import { FileDetailsPage } from '../pages/cms/FileDetailsPage.js';
import { PlaylistsPage } from '../pages/cms/PlaylistsPage.js';
import { SpacesPage } from '../pages/cms/SpacesPage.js';
import { ReportsPage } from '../pages/cms/ReportsPage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_STATE = path.resolve(__dirname, '..', '.auth', 'admin.json');
// Sentinel for a deliberately clean (unauthenticated) context.
export const CLEAN_STATE = { cookies: [], origins: [] };

export const test = base.extend({
  // Reuse the admin session cached by global-setup so we don't re-login on every
  // test (this is the primary defence against auth-endpoint rate-limiting / 429).
  // Tests that need a clean slate opt out:  test.use({ storageState: CLEAN_STATE })
  storageState: async ({}, use) => {
    await use(fs.existsSync(ADMIN_STATE) ? ADMIN_STATE : undefined);
  },

  // Per-test toggle: when true, monitor violations fail the test on teardown.
  // Defaults to the env setting; mock suites override with test.use(...).
  strictMonitors: [ENV.STRICT_MONITORS, { option: true }],

  // ── Console monitor — attached before the test body runs ──────────────────
  consoleMon: async ({ page }, use) => {
    const mon = new ConsoleMonitor(page);
    await use(mon);
  },

  // ── API monitor — attached before the test body runs ──────────────────────
  apiMon: async ({ page }, use) => {
    const mon = new ApiMonitor(page);
    await use(mon);
  },

  // ── Auto-assert hook — runs after every test that pulls these fixtures ─────
  _autoHealth: [
    async ({ consoleMon, apiMon, strictMonitors }, use, testInfo) => {
      await use();
      // Only judge health on tests that actually passed their assertions and
      // did NOT deliberately inject failures.
      if (testInfo.errors.length > 0) return;
      const consoleErrors = consoleMon.allCritical;
      const serverErrors = apiMon.serverErrors;
      if (consoleErrors.length === 0 && serverErrors.length === 0) return;

      const msg =
        `Post-test health check: ${consoleErrors.length} console error(s), ` +
        `${serverErrors.length} unexpected 5xx.`;
      if (strictMonitors) {
        consoleMon.assertClean(testInfo.title);
        apiMon.assertNoServerErrors();
      } else {
        console.warn(`[health] ${msg}`);
        consoleMon.report(testInfo.title);
        apiMon.serverErrors.forEach((e) => console.warn(`   • ${e.status} ${e.url}`));
      }
    },
    { auto: true },
  ],

  // ── Authenticated pages ───────────────────────────────────────────────────
  adminPage: async ({ page }, use) => {
    await login(page, { email: ENV.ADMIN_EMAIL, password: ENV.ADMIN_PASSWORD });
    await use(page);
  },

  subuserPage: async ({ page }, use) => {
    await login(page, { email: ENV.SUBUSER_EMAIL, password: ENV.SUBUSER_PASSWORD });
    await use(page);
  },

  // ── Page-object bundle (lazy) ─────────────────────────────────────────────
  pageObjects: async ({ page }, use) => {
    await use({
      login: new LoginPage(page),
      dashboard: new DashboardPage(page),
      library: new LibraryPage(page),
      fileDetails: new FileDetailsPage(page),
      playlists: new PlaylistsPage(page),
      spaces: new SpacesPage(page),
      reports: new ReportsPage(page),
    });
  },
});

export { expect };
export default test;
