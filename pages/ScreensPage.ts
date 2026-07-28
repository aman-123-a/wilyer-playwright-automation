// =============================================================================
//  ScreensPage — example FUTURE-MODULE page object demonstrating the framework's
//  extension pattern. Screens listing at /screens.
//
//  Selectors verified live against cms.pocsample.in (2026-05-25):
//   • Tabs (links): "All Screens (n)", "Deleted Screens (n)", "Expired Screens (n)".
//   • Search: placeholder "Search...".
//   • Each screen row links to a[href^="/screen-settings/<id>"].
//   • Stat cards: Live Screens / Offline Screens / Expiring Screens / Available Licenses.
//
//  This is the template to follow for Groups, Playlists, Reports, Billing, and
//  Team Management: extend BasePage, expose stable role/placeholder locators,
//  keep waits signal-based, and surface an explicit empty-state guard.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ScreensPage extends BasePage {
  readonly allScreensTab: Locator;
  readonly deletedScreensTab: Locator;
  readonly expiredScreensTab: Locator;
  readonly search: Locator;
  readonly liveScreensCard: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    // Tabs carry a trailing count, e.g. "All Screens (4379)" — match unanchored.
    this.allScreensTab = page.getByRole('link', { name: /all screens/i }).first();
    this.deletedScreensTab = page.getByRole('link', { name: /deleted screens/i }).first();
    this.expiredScreensTab = page.getByRole('link', { name: /expired screens/i }).first();
    // Several hidden "Search..." inputs exist (export/dialog panels); scope to
    // the visible one that belongs to the active listing.
    this.search = page.locator('input[placeholder="Search..."]:visible').first();
    this.liveScreensCard = page.getByRole('heading', { name: /live screens/i });
  }

  async open(): Promise<this> {
    await this.goto('/screens');
    await this.expectShellReady();
    await expect(this.allScreensTab).toBeVisible({ timeout: 20_000 });
    return this;
  }

  /** Row links into a screen's settings page — a stable count/open hook. */
  screenRows(): Locator {
    return this.page.locator('a[href^="/screen-settings/"]');
  }

  async rowCount(): Promise<number> {
    return this.screenRows().count();
  }

  /**
   * The listing always shows rows OR an explicit empty state — never blank.
   * The app is slow, so we poll the row count (count() works regardless of
   * viewport visibility) before falling back to the empty-state check.
   */
  async expectListLoaded(): Promise<this> {
    const loaded = await expect
      .poll(async () => (await this.rowCount()) > 0, { timeout: 30_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);

    if (!loaded) {
      const empty = await this.page
        .getByText(/no (screen|data|result)/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(empty, 'screens list shows rows or an empty state').toBeTruthy();
    }
    return this;
  }

  async searchScreens(term: string): Promise<this> {
    await this.search.click();
    await this.search.fill('');
    await this.search.pressSequentially(term, { delay: 60 });
    await this.page.waitForTimeout(1_200); // debounce window
    return this;
  }
}

export default ScreensPage;
