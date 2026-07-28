// =============================================================================
//  BasePage — shared behaviour for every CMS page object.
//  Holds the authenticated app shell helpers (sidebar nav, breadcrumb, the
//  shared "Are you sure?" confirm dialog) so module pages stay focused on their
//  own surface.
// =============================================================================

import { type Page, type Locator, expect } from '@playwright/test';

/** Sidebar nav routes confirmed live against cms.pocsample.in. */
export const ROUTES = {
  dashboard: '/',
  screens: '/screens',
  groups: '/groups',
  clusters: '/clusters',
  library: '/library',
  rollouts: '/content-rollout',
  playlists: '/playlists',
  team: '/team',
  reports: '/reports',
  whatsNew: '/whats-new',
  help: '/help',
  feedback: '/feedback',
  billing: '/billing',
  account: '/account',
} as const;

export class BasePage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly userEmail: Locator;
  readonly logoutLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('nav, aside').first();
    this.userEmail = page.getByText(/@/).first();
    // Sidebar links carry a leading icon glyph in their accessible name
    // (e.g. " Logout"), so these matchers are intentionally NOT anchored.
    this.logoutLink = page.getByRole('link', { name: /logout/i });
  }

  /** Navigate to an app path relative to baseURL. */
  async goto(path: string): Promise<this> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    return this;
  }

  /** Resolve once the authenticated app shell (sidebar) is present. */
  async expectShellReady(): Promise<this> {
    await expect(this.page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    return this;
  }

  /** Click a sidebar nav item by visible name. */
  async navTo(name: keyof typeof ROUTES): Promise<this> {
    await this.page
      .getByRole('link', { name: new RegExp(name, 'i') })
      .first()
      .click();
    await this.page.waitForLoadState('domcontentloaded');
    return this;
  }

  /** The shared destructive-confirm dialog ("Continue" / "Yes" / "Delete"). */
  async confirmDestructive(): Promise<boolean> {
    const confirm = this.page
      .getByRole('button', { name: /^(continue|yes|confirm|delete)$/i })
      .last();
    if (await confirm.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirm.click();
      return true;
    }
    return false;
  }

  async logout(): Promise<void> {
    await this.logoutLink.click();
    await this.page.waitForURL(/\/$/, { timeout: 15_000 }).catch(() => {});
  }
}

export default BasePage;
