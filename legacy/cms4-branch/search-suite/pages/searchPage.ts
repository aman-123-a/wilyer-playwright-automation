// =============================================================================
//  SearchPage — generic, config-driven Page Object for the shared CMS search
//  bar. One instance drives any module via its ModuleConfig. All waits are
//  signal-based (API response / element state / polled count) — NEVER a fixed
//  page.waitForTimeout().
// =============================================================================

import { type Page, type Locator, type Response, expect } from '@playwright/test';
import { BasePage } from './basePage';
import { type ModuleConfig } from '../config/modules';

export class SearchPage extends BasePage {
  readonly module: ModuleConfig;

  // ── Search-bar locators (the placeholders the spec interacts with) ─────────
  readonly searchInput: Locator;
  readonly clearButton: Locator;
  readonly resultRows: Locator;
  readonly noResults: Locator;
  readonly spinner: Locator;
  readonly pagination: Locator;

  constructor(page: Page, module: ModuleConfig) {
    super(page);
    this.module = module;

    // Several hidden "Search..." inputs can exist (export/dialog panels) — scope
    // to the visible one; fall back to any accessible search box.
    this.searchInput = page
      .locator('input[placeholder="Search..."]:visible')
      .first()
      .or(page.getByPlaceholder(/search/i).first());

    this.clearButton = page
      .locator('button[aria-label*="clear" i], [class*="clear" i] button, svg[class*="close" i], [data-testid="clear-search"]')
      .first();

    this.resultRows = page.locator(module.rowSelector);

    this.noResults = page
      .getByText(/no\s+(records?|results?|data|matching|.*found)|nothing found|no data/i)
      .first();

    this.spinner = page
      .locator('[class*="spinner" i], [class*="loading" i], [role="progressbar"], [data-testid="loading"]')
      .first();

    this.pagination = page
      .locator('[class*="pagination" i], nav[aria-label*="pagination" i], [data-testid="pagination"]')
      .first();
  }

  /** Navigate to the module and wait for its first list load. */
  async open(): Promise<this> {
    const firstLoad = this.waitForSearchApi(30_000);
    await this.goto(this.module.route);
    if (/login|signin/i.test(this.page.url())) {
      throw new Error(`[${this.module.name}] route ${this.module.route} bounced to login (auth lost?)`);
    }
    await firstLoad;
    await expect(this.searchInput, `[${this.module.name}] search input should be present`)
      .toBeVisible({ timeout: 20_000 });
    return this;
  }

  /** Promise that resolves on the next search XHR (or null on timeout). */
  waitForSearchApi(timeout = 15_000): Promise<Response | null> {
    return this.page
      .waitForResponse((r) => this.module.searchApi.test(r.url()), { timeout })
      .catch(() => null);
  }

  /**
   * Type a term and resolve once the search API has responded. Pressing Enter
   * guarantees a request even when live-search/debounce is absent. Returns the
   * search Response (or null if none fired — e.g. an empty query the app drops).
   */
  async search(term: string): Promise<Response | null> {
    const respP = this.waitForSearchApi();
    await this.searchInput.click();
    await this.searchInput.fill('');
    if (term.length) {
      await this.searchInput.pressSequentially(term, { delay: 30 });
    }
    await this.searchInput.press('Enter').catch(() => {});
    return respP;
  }

  /** Clear via the X control if present, else empty the field + re-query. */
  async clearSearch(): Promise<void> {
    const respP = this.waitForSearchApi();
    if (await this.clearButton.isVisible().catch(() => false)) {
      await this.clearButton.click();
    } else {
      await this.searchInput.fill('');
      await this.searchInput.press('Enter').catch(() => {});
    }
    await respP;
  }

  /** Settle the result region: spinner gone, then rows OR empty-state present. */
  async waitForSearchResults(timeout = 15_000): Promise<void> {
    if (await this.spinner.isVisible().catch(() => false)) {
      await this.spinner.waitFor({ state: 'hidden', timeout }).catch(() => {});
    }
    await expect
      .poll(
        async () => (await this.rowCount()) > 0 || (await this.noResults.isVisible().catch(() => false)),
        { timeout },
      )
      .toBeTruthy();
  }

  async rowCount(): Promise<number> {
    return this.resultRows.count();
  }

  /** Text of the first row — used to derive a data-independent seed term. */
  async firstRowText(): Promise<string> {
    if ((await this.rowCount()) === 0) return '';
    return (await this.resultRows.first().innerText().catch(() => '')) ?? '';
  }
}

export default SearchPage;
