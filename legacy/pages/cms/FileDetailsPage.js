// =============================================================================
//  FileDetailsPage — the media-detail / preview surface at /file-details/<id>.
//  Hosts media metadata, a Download link, and the report tabs that two known
//  post-merge bugs target: "Delivery Report" (delivery status not showing) and
//  "Publish History" (media publish history not showing).
// =============================================================================

import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class FileDetailsPage extends BasePage {
  constructor(page) {
    super(page);
    this.backBtn = page.getByRole('button', { name: /^back$/i });
    this.title = page.getByRole('heading', { level: 2 });
    this.downloadLink = page.getByRole('link', { name: /download/i });

    // Metadata labels rendered as a definition-style grid.
    this.metaResolution = page.getByText(/^resolution$/i);
    this.metaFormat = page.getByText(/^format$/i);
    this.metaFileSize = page.getByText(/^file size$/i);

    // Report tabs.
    this.playbackTab = page.getByRole('button', { name: /playback reports/i });
    this.deliveryTab = page.getByRole('button', { name: /delivery report/i });
    this.targetScreensTab = page.getByRole('button', { name: /target screens/i });
    this.publishHistoryTab = page.getByRole('button', { name: /publish history/i });
  }

  /** Navigate directly to a known media id. */
  async open(id) {
    await this.goto(`/file-details/${id}`);
    await this.expectShellReady();
    return this;
  }

  async expectLoaded() {
    await expect(this.title).toBeVisible({ timeout: 15_000 });
    return this;
  }

  /** Open a report tab by key; returns true if the tab exists. */
  async openTab(key) {
    const map = {
      playback: this.playbackTab,
      delivery: this.deliveryTab,
      targets: this.targetScreensTab,
      history: this.publishHistoryTab,
    };
    const tab = map[key];
    if (!(await tab.isVisible().catch(() => false))) return false;
    await tab.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(800);
    return true;
  }
}

export default FileDetailsPage;
