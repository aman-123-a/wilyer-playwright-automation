// =============================================================================
//  ReportsPage — reports / analytics export surface. Hosts the CSV / Athena
//  export controls and playback analytics views. Selectors are intentionally
//  tolerant (the reports UI varies by tenant); export-failure behaviour is
//  primarily exercised via network mocking in the specs.
// =============================================================================

import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class ReportsPage extends BasePage {
  constructor(page) {
    super(page);
    this.reportsLink = page.getByRole('link', { name: /reports/i });
    this.exportBtn = page
      .getByRole('button', { name: /export|download|csv/i })
      .or(page.getByRole('link', { name: /export|download|csv/i }));
    this.dateFrom = page.locator('input[type="date"]').first();
    this.dateTo = page.locator('input[type="date"]').last();
  }

  async open() {
    await this.goto('/reports');
    await this.expectShellReady();
    return this;
  }

  async expectLoaded() {
    await expect(this.reportsLink).toBeVisible({ timeout: 15_000 });
    return this;
  }

  hasExportControl() {
    return this.exportBtn.first().isVisible().catch(() => false);
  }

  /** Set a date range if date inputs exist. Returns false if unavailable. */
  async setDateRange(from, to) {
    if (await this.dateFrom.isVisible().catch(() => false)) {
      await this.dateFrom.fill(from);
      await this.dateTo.fill(to);
      return true;
    }
    return false;
  }

  /**
   * Trigger an export and return the resulting Download (if the app downloads
   * synchronously). Returns null if no download event fires (async exports
   * complete via email/CloudFront and are validated via mocks instead).
   */
  async triggerExport({ timeout = 15_000 } = {}) {
    if (!(await this.hasExportControl())) return null;
    const downloadPromise = this.page.waitForEvent('download', { timeout }).catch(() => null);
    await this.exportBtn.first().click();
    return downloadPromise;
  }
}

export default ReportsPage;
