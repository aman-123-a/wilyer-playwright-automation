// =============================================================================
//  BasePage — shared behaviour for every CMS page object.
//  Holds the sidebar/navigation locators common to the authenticated shell and
//  helpers every page reuses (navigate, wait-for-ready, search).
// =============================================================================

import { expect } from '@playwright/test';
import { ENV } from '../../utils/cms/env.js';

export class BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.baseURL = ENV.BASE_URL;

    // Authenticated-shell landmarks (present on every internal page).
    this.dashboardLink = page.getByRole('link', { name: /dashboard/i });
    this.logoutLink = page.getByRole('link', { name: /logout|log out|sign out/i });
    this.searchBox = page.getByRole('textbox', { name: /search/i });
  }

  /** Absolute URL for a route path ('/playlists' -> 'https://.../playlists'). */
  url(routePath = '/') {
    return new URL(routePath, this.baseURL).toString();
  }

  /** Go to a route and wait for the network to settle. */
  async goto(routePath = '/', waitUntil = 'networkidle') {
    await this.page.goto(this.url(routePath), { waitUntil });
    return this;
  }

  /** Confirm the authenticated shell rendered (sidebar present). */
  async expectShellReady() {
    await expect(this.dashboardLink).toBeVisible({ timeout: 20_000 });
    return this;
  }

  /** Debounced search helper (no hardcoded sleep beyond the debounce window). */
  async search(term, { settleMs = 1200 } = {}) {
    const box = this.searchBox.first();
    await box.fill(term);
    // Wait for the app's debounce/network to settle rather than a fixed sleep.
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(settleMs);
    return this;
  }

  rows() {
    return this.page.locator('table tbody tr');
  }
}

export default BasePage;
