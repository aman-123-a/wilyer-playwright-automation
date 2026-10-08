import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

// DashboardPage: post-login landing surface — used for smoke verification + navigation
export class DashboardPage extends BasePage {
  constructor(page) {
    super(page);
    this.dashboardLink = page.getByRole('link', { name: /dashboard/i });
    this.playlistsNav  = page.getByRole('link', { name: /playlists?/i });
    this.libraryNav    = page.getByRole('link', { name: /library/i });
    this.approvalsNav  = page.getByRole('link', { name: /approvals?|unapproved/i });
    this.userMenu      = page.locator('[data-test="user-menu"], .user-menu, header button:has-text("Profile")');
  }

  async assertLoaded() {
    await expect(this.dashboardLink).toBeVisible({ timeout: 20_000 });
  }

  async openPlaylists() {
    await this.playlistsNav.first().click();
    await this.waitForIdle();
  }

  async openLibrary() {
    await this.libraryNav.first().click();
    await this.waitForIdle();
  }

  async openApprovals() {
    await this.approvalsNav.first().click();
    await this.waitForIdle();
  }
}
