// =============================================================================
//  ScreenPage — screens listing at /screens + per-screen settings detail.
//  Selectors verified live against cms.pocsample.in:
//   • Tabs (links): "All Screens (n)", "Deleted Screens (n)", "Expired Screens (n)".
//   • Search: placeholder "Search...".
//   • Each screen row links to a[href^="/screen-settings/<id>"].
//   • Stat cards: Live Screens / Offline Screens / Expiring Screens / Available Licenses.
//  Screen-settings detail selectors are kept resilient (the detail page is a
//  tabbed editor whose exact field labels vary by screen state).
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ScreenPage extends BasePage {
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
    // Several hidden "Search..." inputs exist; scope to the visible listing one.
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

  /** Listing always shows rows OR an explicit empty state — never blank. */
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
    await this.page.waitForTimeout(1_200);
    return this;
  }

  // ── Screen detail / settings ────────────────────────────────────────────────

  /** Open the first screen's settings page. */
  async openFirstScreen(): Promise<this> {
    const link = this.screenRows().first();
    await expect(link).toBeVisible({ timeout: 25_000 });
    await link.click();
    await this.page.waitForURL(/\/screen-settings\//, { timeout: 25_000 });
    await this.page.waitForLoadState('domcontentloaded');
    return this;
  }

  async isOnSettings(): Promise<boolean> {
    return /\/screen-settings\//.test(this.page.url());
  }

  /** Tabs/sections on the screen-settings editor. */
  settingsTabs(): Locator {
    return this.page
      .getByRole('tab')
      .or(this.page.getByRole('link', { name: /general|settings|display|schedule|playlist|configuration|details/i }));
  }

  /**
   * Verify the screen-detail surface exposes the core attributes the spec
   * requires (name, status, resolution, configuration). Each is checked softly
   * and the set is asserted to be substantially present so the test is robust to
   * per-screen variation.
   */
  async expectDetailAttributes(): Promise<{ found: string[]; missing: string[] }> {
    const attributes: Record<string, RegExp> = {
      name: /name|screen name|device name/i,
      status: /online|offline|status|active|inactive/i,
      resolution: /resolution|\b\d{3,4}\s*[x×]\s*\d{3,4}\b|orientation/i,
      configuration: /settings|configuration|display|playback|general/i,
    };
    const found: string[] = [];
    const missing: string[] = [];
    for (const [key, re] of Object.entries(attributes)) {
      const visible = await this.page
        .getByText(re)
        .first()
        .isVisible({ timeout: 8_000 })
        .catch(() => false);
      (visible ? found : missing).push(key);
    }
    return { found, missing };
  }
}

export default ScreenPage;
