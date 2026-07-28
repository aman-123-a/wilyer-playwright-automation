// =============================================================================
//  GroupsPage — groups listing at /groups (Spaces/Rooms are modelled as Groups).
//  Selectors verified live against cms.pocsample.in (2026-05-25):
//   • Toolbar: button "New Group" (opens the create modal → "Create Group").
//   • Search: placeholder "Search..." (scope to the visible one).
//   • Listing: a single <table> of groups (8 rows at probe time).
//  Follows the BasePage extension template — see ScreensPage for the pattern.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class GroupsPage extends BasePage {
  readonly newGroupBtn: Locator;
  readonly search: Locator;
  readonly table: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.newGroupBtn = page.getByRole('button', { name: /new group/i });
    this.search = page.locator('input[placeholder="Search..."]:visible').first();
    this.table = page.getByRole('table').first();
  }

  async open(): Promise<this> {
    await this.goto('/groups');
    await this.expectShellReady();
    await expect(this.newGroupBtn).toBeVisible({ timeout: 20_000 });
    return this;
  }

  rows(): Locator {
    return this.table.locator('tbody tr');
  }

  async rowCount(): Promise<number> {
    return this.rows().count();
  }

  /** The listing always shows group rows OR an explicit empty state. */
  async expectListLoaded(): Promise<this> {
    const loaded = await expect
      .poll(async () => (await this.rowCount()) > 0, { timeout: 30_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      const empty = await this.page
        .getByText(/no (group|data|result)/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(empty, 'groups list shows rows or an empty state').toBeTruthy();
    }
    return this;
  }

  /** Open the create-group modal and confirm it rendered. */
  async openCreateModal(): Promise<this> {
    await this.newGroupBtn.click();
    await expect(this.page.getByRole('button', { name: /create group/i })).toBeVisible({
      timeout: 10_000,
    });
    return this;
  }

  async searchGroups(term: string): Promise<this> {
    await this.search.click();
    await this.search.fill('');
    await this.search.pressSequentially(term, { delay: 60 });
    await this.page.waitForTimeout(1_200);
    return this;
  }
}

export default GroupsPage;
