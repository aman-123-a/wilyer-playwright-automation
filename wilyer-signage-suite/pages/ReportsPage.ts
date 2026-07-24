// =============================================================================
//  ReportsPage — analytics generation + PDF/CSV/Excel export.
// =============================================================================
import { Page, Locator, expect, Download } from '@playwright/test';
import { BasePage } from './BasePage';
import { ROUTES } from '../config/routes';

export class ReportsPage extends BasePage {
  readonly generateButton: Locator;
  readonly dateRange: Locator;
  readonly exportButton: Locator;

  constructor(page: Page) {
    super(page);
    this.generateButton = page.getByTestId('generate-report').or(page.getByRole('button', { name: /generate|run report|apply|view report/i })).first();
    this.dateRange = page.getByTestId('date-range').or(page.locator('[class*="date" i] input, input[type="date"]')).first();
    this.exportButton = page.getByTestId('export').or(page.getByRole('button', { name: /export|download/i })).first();
  }

  async open(): Promise<void> {
    await this.goto(ROUTES.reports);
    await expect(this.generateButton.or(this.exportButton)).toBeVisible({ timeout: 20_000 });
  }

  async generate(): Promise<void> {
    await this.generateButton.click();
  }

  /**
   * Trigger an export of a given format and return the captured download.
   * Falls back through a menu if the format is behind a dropdown.
   */
  async export(format: 'pdf' | 'csv' | 'excel'): Promise<Download> {
    const fmtLabel = format === 'excel' ? /excel|xlsx/i : new RegExp(format, 'i');
    const downloadP = this.page.waitForEvent('download', { timeout: 30_000 });
    // Direct button first
    const direct = this.page.getByRole('button', { name: new RegExp(`export.*${format}|${format}`, 'i') }).first();
    if (await direct.isVisible().catch(() => false)) {
      await direct.click();
    } else {
      await this.exportButton.click();
      await this.page.getByRole('menuitem', { name: fmtLabel }).or(this.page.getByText(fmtLabel)).first().click();
    }
    return downloadP;
  }

  /** Whether an empty-state ("no data") message is shown for the current report. */
  async hasNoDataState(): Promise<boolean> {
    return this.page.locator('body').filter({ hasText: /no data|nothing to show|no records|empty/i }).first().isVisible().catch(() => false);
  }
}
