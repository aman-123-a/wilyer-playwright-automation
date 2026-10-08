/**
 * Custom Playwright fixtures — the backbone of the framework's reusability.
 *
 * Extends the base `test` with:
 *  - page objects (login/dashboard/upload/approval/notification) wired to the
 *    active page,
 *  - a `NetworkMonitor` that auto-starts and is available to every test,
 *  - role-scoped authenticated pages (`makerPage`, `checkerPage`) that reuse
 *    the stored storage-state from global setup,
 *  - an `EmailHelper` that opens/closes an IMAP connection around the test.
 *
 * Specs import `test`/`expect` from here instead of `@playwright/test`, so they
 * get the page objects injected for free and stay declarative.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { DashboardPage } from '../pages/DashboardPage.js';
import { UploadPage } from '../pages/UploadPage.js';
import { ApprovalPage } from '../pages/ApprovalPage.js';
import { NotificationPage } from '../pages/NotificationPage.js';
import { NetworkMonitor, ApiHelper } from '../utils/apiHelper.js';
import { EmailHelper } from '../utils/emailHelper.js';
import { LoginHelper } from '../utils/loginHelper.js';
import { STORAGE_STATE } from '../config/constants.js';
import { env } from '../config/env.js';

interface PageObjects {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  uploadPage: UploadPage;
  approvalPage: ApprovalPage;
  notificationPage: NotificationPage;
}

interface Helpers {
  network: NetworkMonitor;
  api: ApiHelper;
  email: EmailHelper;
}

interface RoleScopedPages {
  /** A page authenticated as the Maker (reuses stored session). */
  makerPage: Page;
  /** A page authenticated as the Checker (reuses stored session). */
  checkerPage: Page;
}

export const test = base.extend<PageObjects & Helpers & RoleScopedPages>({
  // ---- Network monitor: auto-start on the default page ---------------------
  network: async ({ page }, use) => {
    const monitor = new NetworkMonitor(page);
    monitor.start();
    await use(monitor);
  },

  // ---- Direct API helper ---------------------------------------------------
  api: async ({ request }, use) => {
    await use(new ApiHelper(request, env.app.apiBaseURL));
  },

  // ---- Email helper: open IMAP if configured, always close after ----------
  email: async ({}, use) => {
    const helper = new EmailHelper();
    if (helper.isConfigured) {
      await helper.connect().catch(() => undefined);
    }
    await use(helper);
    await helper.disconnect();
  },

  // ---- Page objects --------------------------------------------------------
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  dashboardPage: async ({ page }, use) => use(new DashboardPage(page)),
  uploadPage: async ({ page }, use) => use(new UploadPage(page)),
  approvalPage: async ({ page }, use) => use(new ApprovalPage(page)),
  notificationPage: async ({ page }, use) => use(new NotificationPage(page)),

  // ---- Role-scoped authenticated pages ------------------------------------
  makerPage: async ({ browser }, use) => {
    const context = await LoginHelper.contextForRole(browser, 'maker');
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  checkerPage: async ({ browser }, use) => {
    const context = await LoginHelper.contextForRole(browser, 'checker');
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect, STORAGE_STATE };
