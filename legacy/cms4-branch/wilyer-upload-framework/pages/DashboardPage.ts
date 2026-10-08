/**
 * Dashboard Page Object.
 *
 * Represents the authenticated landing area. Primary job is to confirm a
 * successful login (used by the login helper's "wait for dashboard load")
 * and to expose navigation into the Library/Upload and Approvals modules.
 */
import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { ROUTES } from '../config/constants.js';
import { env } from '../config/env.js';

export class DashboardPage extends BasePage {
  private readonly appShell: Locator;
  private readonly libraryNav: Locator;
  private readonly approvalsNav: Locator;
  private readonly userMenu: Locator;

  constructor(page: Page) {
    super(page, 'DashboardPage');
    // The persistent app chrome (sidebar/header) confirms we're inside the app.
    this.appShell = page.locator('aside, nav, [class*="sidebar" i], [class*="layout" i]').first();
    this.libraryNav = page.getByRole('link', { name: /library|files|upload/i }).first();
    this.approvalsNav = page.getByRole('link', { name: /approval|pending|review/i }).first();
    this.userMenu = page.locator('[class*="avatar" i], [class*="user" i], [aria-label*="account" i]').first();
  }

  /**
   * Wait until the dashboard/app shell is rendered. We deliberately do NOT
   * pin to a single URL because the post-login landing route can vary; instead
   * we wait for the app chrome to be visible and confirm we're off /login.
   */
  async waitForLoaded(): Promise<void> {
    await this.appShell.waitFor({ state: 'visible', timeout: env.exec.navTimeoutMs });
    await this.page.waitForFunction(
      () => !window.location.pathname.includes('/login'),
      undefined,
      { timeout: env.exec.navTimeoutMs },
    );
    this.log.info('Dashboard loaded');
  }

  /** True if we appear to be authenticated (app shell present, not on login). */
  async isLoaded(): Promise<boolean> {
    return (await this.appShell.isVisible().catch(() => false)) && !this.url().includes(ROUTES.login);
  }

  async goToLibrary(): Promise<void> {
    if (await this.libraryNav.isVisible().catch(() => false)) {
      await this.libraryNav.click();
    } else {
      await this.navigate(ROUTES.library);
    }
    await this.waitForNetworkIdle();
  }

  async goToApprovals(): Promise<void> {
    if (await this.approvalsNav.isVisible().catch(() => false)) {
      await this.approvalsNav.click();
    } else {
      await this.navigate(ROUTES.approvals);
    }
    await this.waitForNetworkIdle();
  }

  /** Whether the Approvals navigation entry is visible (permission check). */
  async hasApprovalsNav(): Promise<boolean> {
    return this.approvalsNav.isVisible().catch(() => false);
  }

  /** Whether the Library/Upload navigation entry is visible (permission check). */
  async hasLibraryNav(): Promise<boolean> {
    return this.libraryNav.isVisible().catch(() => false);
  }

  userMenuLocator(): Locator {
    return this.userMenu;
  }
}
