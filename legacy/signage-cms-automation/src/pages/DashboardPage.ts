// =============================================================================
//  DashboardPage — landing surface at "/".
//  Verified live against cms.pocsample.in:
//   • Stat cards (links): Online/Offline/Total Screens, Total Media Files,
//     Storage Used, Available Licences, Licenses Expiring Soon.
//   • Quick actions (links): New Screen, Add Media, New Playlist, New Group.
//   • Breadcrumb: link "Home" + strong "Dashboard".
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  readonly breadcrumb: Locator;
  readonly statCards: Locator;
  readonly newScreenBtn: Locator;
  readonly addMediaBtn: Locator;
  readonly newPlaylistBtn: Locator;
  readonly newGroupBtn: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.breadcrumb = page.getByText(/dashboard/i).first();
    this.statCards = page.locator('a').filter({ has: page.locator('h3') });
    this.newScreenBtn = page.getByRole('link', { name: /new screen/i });
    this.addMediaBtn = page.getByRole('link', { name: /add media/i });
    this.newPlaylistBtn = page.getByRole('link', { name: /new playlist/i });
    this.newGroupBtn = page.getByRole('link', { name: /new group/i });
  }

  async open(): Promise<this> {
    await this.goto('/');
    await this.expectShellReady();
    return this;
  }

  /** A single stat card by its label text (e.g. "Total Screens"). */
  card(label: string | RegExp): Locator {
    const re = typeof label === 'string' ? new RegExp(label, 'i') : label;
    return this.page
      .getByRole('link')
      .filter({ has: this.page.getByRole('heading', { name: re }) });
  }

  /** The numeric/text value rendered inside a stat card. */
  async cardValue(label: string | RegExp): Promise<string> {
    const value = this.card(label).getByRole('heading', { level: 3 }).first();
    return (await value.innerText()).trim();
  }

  async expectLoaded(): Promise<this> {
    await expect(this.card(/total screens/i)).toBeVisible({ timeout: 20_000 });
    await expect(this.card(/total media files/i)).toBeVisible();
    return this;
  }

  async expectQuickActions(): Promise<this> {
    await expect(this.newScreenBtn).toBeVisible();
    await expect(this.addMediaBtn).toBeVisible();
    await expect(this.newPlaylistBtn).toBeVisible();
    await expect(this.newGroupBtn).toBeVisible();
    return this;
  }
}

export default DashboardPage;
