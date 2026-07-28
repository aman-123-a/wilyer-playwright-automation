// =============================================================================
//  TeamPage — team management at /team.
//  Selectors verified live against cms.pocsample.in (2026-05-25):
//   • Tabs are LINKS (<a class="nav-link" href="/team">): "Members", "Roles",
//     "Logs"; "New Member" is also a nav-link.
//   • Members renders a <table> (20 rows) with Previous/1/2/3/Next pagination.
//   • Search: placeholder "Search..." (scope to the visible one).
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class TeamPage extends BasePage {
  readonly membersTab: Locator;
  readonly rolesTab: Locator;
  readonly logsTab: Locator;
  readonly newMemberBtn: Locator;
  readonly search: Locator;
  readonly table: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.membersTab = page.getByRole('link', { name: /^members$/i });
    this.rolesTab = page.getByRole('link', { name: /^roles$/i });
    this.logsTab = page.getByRole('link', { name: /^logs$/i });
    this.newMemberBtn = page.getByRole('link', { name: /new member/i });
    this.search = page.locator('input[placeholder="Search..."]:visible').first();
    this.table = page.getByRole('table').first();
  }

  async open(): Promise<this> {
    await this.goto('/team');
    await this.expectShellReady();
    await expect(this.membersTab).toBeVisible({ timeout: 20_000 });
    return this;
  }

  rows(): Locator {
    return this.table.locator('tbody tr');
  }

  async rowCount(): Promise<number> {
    return this.rows().count();
  }

  /** Members table always shows rows OR an explicit empty state. */
  async expectMembersLoaded(): Promise<this> {
    const loaded = await expect
      .poll(async () => (await this.rowCount()) > 0, { timeout: 30_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      const empty = await this.page
        .getByText(/no (member|data|result)/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(empty, 'members table shows rows or an empty state').toBeTruthy();
    }
    return this;
  }

  async openRoles(): Promise<this> {
    await this.rolesTab.click();
    await this.page.waitForLoadState('domcontentloaded');
    return this;
  }

  async openLogs(): Promise<this> {
    await this.logsTab.click();
    await this.page.waitForLoadState('domcontentloaded');
    return this;
  }

  async searchMembers(term: string): Promise<this> {
    await this.search.click();
    await this.search.fill('');
    await this.search.pressSequentially(term, { delay: 60 });
    await this.page.waitForTimeout(1_200);
    return this;
  }
}

export default TeamPage;
