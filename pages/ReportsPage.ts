// =============================================================================
//  ReportsPage — analytics & reports at /reports.
//  Selectors verified live against cms.pocsample.in (2026-05-25):
//   • Tabs (buttons): "Analytics", "Previous Reports".
//   • Export actions (buttons): "Export PDF", "Export CSV".
//   • Analytics renders summary tables (Screen Reports / File Reports).
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ReportsPage extends BasePage {
  readonly analyticsTab: Locator;
  readonly previousReportsTab: Locator;
  readonly exportPdfBtn: Locator;
  readonly exportCsvBtn: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.analyticsTab = page.getByRole('button', { name: /^analytics$/i });
    this.previousReportsTab = page.getByRole('button', { name: /previous reports/i });
    // Plain text locators (not getByRole) so they also match the export buttons
    // that live in on-demand dialogs (display:none → absent from the a11y tree).
    this.exportPdfBtn = page.locator('button', { hasText: /export pdf/i });
    this.exportCsvBtn = page.locator('button', { hasText: /export csv/i });
  }

  async open(): Promise<this> {
    await this.goto('/reports');
    await this.expectShellReady();
    await expect(this.analyticsTab).toBeVisible({ timeout: 20_000 });
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.analyticsTab).toBeVisible();
    await expect(this.previousReportsTab).toBeVisible();
    return this;
  }

  async openPreviousReports(): Promise<this> {
    await this.previousReportsTab.click();
    await this.page.waitForLoadState('domcontentloaded');
    return this;
  }

  /**
   * Export controls (PDF/CSV) are present. They are surfaced via on-demand
   * export dialogs rather than shown on initial load, so this asserts the
   * capability EXISTS in the DOM rather than requiring immediate visibility.
   */
  async expectExportAvailable(): Promise<this> {
    const pdf = await this.exportPdfBtn.count();
    const csv = await this.exportCsvBtn.count();
    expect(pdf + csv, 'an export action (PDF or CSV) is available').toBeGreaterThan(0);
    return this;
  }
}

export default ReportsPage;
