// =============================================================================
//  DashboardPage — landing page after login. Stat cards, quick actions,
//  recent-screens table, map widget, and analytics range controls.
// =============================================================================

import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class DashboardPage extends BasePage {
  constructor(page) {
    super(page);

    this.statHeadings = {
      online: page.getByRole('heading', { name: /online screens/i }),
      offline: page.getByRole('heading', { name: /offline screens/i }),
      total: page.getByRole('heading', { name: /total screens/i }),
      media: page.getByRole('heading', { name: /total media files/i }),
      storage: page.getByRole('heading', { name: /storage used/i }),
      licences: page.getByRole('heading', { name: /available licen[cs]es/i }),
    };

    this.quickActions = {
      newScreen: page.getByRole('link', { name: /new screen/i }),
      addMedia: page.getByRole('link', { name: /add media/i }),
      newPlaylist: page.getByRole('link', { name: /new playlist/i }),
      newGroup: page.getByRole('link', { name: /new group/i }),
    };

    this.recentTable = page.locator('table').first();
    this.mapWidget = page.getByText(/screens location/i);
  }

  async open() {
    await this.goto('/');
    await this.expectShellReady();
    return this;
  }

  async expectStatCardsVisible() {
    for (const [name, loc] of Object.entries(this.statHeadings)) {
      await expect(loc, `stat card "${name}" should be visible`).toBeVisible({ timeout: 15_000 });
    }
    return this;
  }

  /**
   * KPI sanity — the numeric value rendered near a stat heading should parse to
   * a non-negative finite number. Returns the parsed map.
   */
  async readKpis() {
    const result = {};
    for (const [name, heading] of Object.entries(this.statHeadings)) {
      const card = heading.locator('xpath=ancestor::*[self::div][1]');
      const text = await card.innerText().catch(() => '');
      const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
      result[name] = match ? Number(match[0]) : null;
    }
    return result;
  }

  /**
   * Select an analytics range if a range control exists (e.g. "7 days"/"30 days").
   * Tolerant: returns false if the control isn't found rather than failing — the
   * caller decides whether the control is required.
   */
  async selectAnalyticsRange(label) {
    const candidates = [
      this.page.getByRole('button', { name: new RegExp(label, 'i') }),
      this.page.getByRole('tab', { name: new RegExp(label, 'i') }),
      this.page.getByText(new RegExp(`^\\s*${label}\\s*$`, 'i')),
    ];
    for (const c of candidates) {
      if (await c.first().isVisible().catch(() => false)) {
        await c.first().click();
        await this.page.waitForLoadState('networkidle').catch(() => {});
        return true;
      }
    }
    return false;
  }
}

export default DashboardPage;
