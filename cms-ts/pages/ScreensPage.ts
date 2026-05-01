import { Locator, expect } from '@playwright/test';
import { BasePage, step } from './BasePage';

/**
 * Wraps the /screens page: list view, search, page-size selector,
 * pagination and bulk-select.
 *
 * The list is server-paginated; on this CMS the data endpoint is
 *   GET /v3/cms/screen/read?page=N&limit=L
 * and the count endpoint is /v3/cms/screen/readStats. The scale spec mocks
 * those; this POM is API-agnostic.
 */
export class ScreensPage extends BasePage {
  // ─── Header / count ────────────────────────────────────────────────────────
  /** "All Screens (N)" link in the page header. */
  get allScreensTab() {
    return this.page.getByRole('link', { name: /All Screens/i }).first();
  }

  /** Reads the integer in "All Screens (N)". Returns -1 if not parseable. */
  async readVisibleTotal(): Promise<number> {
    const text = (await this.allScreensTab.textContent()) || '';
    const m = text.match(/\((\d[\d,]*)\)/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : -1;
  }

  // ─── Toolbar ───────────────────────────────────────────────────────────────
  get pageSizeSelect() {
    // Native <select> exposing 20 / 50 / 100 / ... / 1000 Screens
    return this.page.locator('select').filter({ hasText: /screens/i }).first();
  }
  get searchInput() {
    return this.page.locator('input[placeholder^="Search" i]:visible').first();
  }
  get newScreenButton() {
    return this.page.getByRole('button', { name: /New Screen/i });
  }

  // ─── Table ────────────────────────────────────────────────────────────────
  get table() {
    return this.page.getByRole('table').first();
  }
  rows(): Locator {
    return this.table.locator('tbody tr');
  }
  /** The "select all" checkbox in the table header. */
  get selectAllCheckbox() {
    return this.table.locator('thead input[type="checkbox"]').first();
  }
  rowCheckbox(rowIdx: number): Locator {
    return this.rows().nth(rowIdx).locator('input[type="checkbox"]').first();
  }

  // ─── Pagination ───────────────────────────────────────────────────────────
  get pagination() {
    return this.page.getByRole('navigation', { name: /page navigation/i });
  }
  get prevPageButton() {
    return this.pagination.getByRole('button', { name: /^Previous$/i });
  }
  get nextPageButton() {
    return this.pagination.getByRole('button', { name: /^Next$/i });
  }
  get processingLoader() {
    // Whatever spinner the app shows during a long bulk action — match permissively
    return this.page.locator('[role="progressbar"], .spinner, [class*="loader" i], [class*="processing" i]')
      .filter({ hasText: /process|loading/i })
      .or(this.page.getByText(/processing|loading/i));
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  async open() {
    step('open Screens page');
    await this.goto('/screens');
    await expect(this.allScreensTab).toBeVisible({ timeout: 30_000 });
  }

  async setPageSize(size: 20 | 50 | 100 | 200 | 500 | 1000) {
    step(`set page size = ${size}`);
    await this.pageSizeSelect.selectOption({ label: `${size} Screens` });
  }

  async gotoLastPage(maxClicks = 2_000): Promise<number> {
    step('paginate to the last page');
    let clicks = 0;
    while (clicks < maxClicks) {
      const isDisabled = await this.nextPageButton.isDisabled().catch(() => true);
      if (isDisabled) break;
      await this.nextPageButton.click();
      clicks++;
      await this.page.waitForTimeout(60); // give the row swap time
    }
    return clicks;
  }

  async selectAllVisible() {
    step('check the table-header "select all" box');
    await this.selectAllCheckbox.check({ force: true });
  }

  /** Returns the JS heap usage at this moment, in MB. Falls back to -1. */
  async heapMB(): Promise<number> {
    return await this.page.evaluate(() => {
      const m = (performance as any).memory;
      return m ? Math.round(m.usedJSHeapSize / 1024 / 1024) : -1;
    });
  }

  /**
   * Scroll the list to the bottom by repeatedly pressing PageDown / End on
   * the table. Used by the virtualization test to detect lag.
   */
  async scrollListToBottom(rounds = 50) {
    step(`scroll list ${rounds} rounds`);
    await this.table.scrollIntoViewIfNeeded();
    await this.table.click({ position: { x: 5, y: 5 } }).catch(() => {});
    for (let i = 0; i < rounds; i++) {
      await this.page.keyboard.press('PageDown');
      await this.page.waitForTimeout(20);
    }
    await this.page.keyboard.press('End').catch(() => {});
  }
}
