// =============================================================================
//  SpacesPage — "Spaces / Rooms" in the requirements maps to the CMS **Groups**
//  module (/groups): there is no separate Spaces/Rooms route. A Group groups
//  screens the way a room/space does, and the post-merge bugs ("duplicate room
//  creation", "deleted spaces restore") are exercised here.
//
//  Selectors verified live against cms.pocsample.in:
//   • "New Group" button → modal heading "New Group", input#name,
//     textarea#description, button "Create Group".
//   • Cards link to /group-settings/<id>; delete = an icon button (bi-trash-fill).
//   • No trash/restore view is exposed on the page (the restore tests probe for
//     one and skip-with-reason if absent — that absence IS the reported bug).
// =============================================================================

import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class SpacesPage extends BasePage {
  constructor(page) {
    super(page);
    this.newGroupBtn = page.getByRole('button', { name: /\+?\s*new group/i }).first();
    this.totalCount = page.getByText(/total groups/i);
    this.search = page.getByPlaceholder(/^search/i).first();
  }

  async open() {
    await this.goto('/groups');
    await this.expectShellReady();
    return this;
  }

  groupLinks() {
    return this.page.locator('a[href^="/group-settings/"]');
  }

  cardByName(name) {
    return this.page
      .locator('div')
      .filter({ has: this.page.locator('a[href^="/group-settings/"]') })
      .filter({ hasText: name })
      .last();
  }

  async exists(name) {
    return (await this.cardByName(name).count()) > 0;
  }

  // ── Create ──────────────────────────────────────────────────────────────
  async openCreateModal() {
    await this.newGroupBtn.click();
    const modal = this.page.locator('[role="dialog"], .modal.show').filter({ hasText: /new group/i }).first();
    await expect(modal).toBeVisible({ timeout: 10_000 });
    return modal;
  }

  /**
   * Create a group. Returns when either a new card appears or a toast/error
   * surfaces. Does not assert success (callers decide — duplicate-name tests
   * expect rejection).
   */
  async create(name, description = '') {
    const modal = await this.openCreateModal();
    await modal.locator('#name').fill(name);
    if (description) await modal.locator('#description').fill(description).catch(() => {});
    await modal.getByRole('button', { name: /create group/i }).click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(1200);
    return this;
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  /**
   * Delete the group matching `name`. The /groups search filters server-side, so
   * we narrow to the (uniquely-named) target first, then click its trash button
   * (`settingButton` with a bi-trash-fill icon, data-bs-toggle="modal") and
   * confirm. Safe: a unique TEST_ name matches only our own group.
   */
  async deleteByName(name) {
    if (await this.search.isVisible().catch(() => false)) {
      await this.search.fill(name);
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.page.waitForTimeout(1200);
    }
    if ((await this.groupLinks().count()) === 0) return false; // nothing matched
    const del = this.page.locator('button.settingButton:has(i.bi-trash-fill)').first()
      .or(this.page.locator('button[data-bs-toggle="modal"]:has(i.bi-trash-fill)').first());
    if (!(await del.isVisible().catch(() => false))) return false;
    await del.click();
    await this.confirmDestructive();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(1200);
    return true;
  }

  async confirmDestructive() {
    const dialog = this.page
      .locator('[role="dialog"], .modal.show, .modal[style*="block"]')
      .filter({ hasText: /are you sure|delete/i })
      .last();
    const cont = dialog.getByRole('button', { name: /^(continue|yes|confirm|delete)$/i }).first();
    if (await cont.isVisible({ timeout: 6000 }).catch(() => false)) {
      await cont.click();
      return true;
    }
    const any = this.page.getByRole('button', { name: /^(continue|yes|confirm)$/i }).last();
    if (await any.isVisible({ timeout: 2000 }).catch(() => false)) {
      await any.click();
      return true;
    }
    return false;
  }

  // ── Restore (probe) ───────────────────────────────────────────────────────
  /**
   * Look for any trash / deleted / restore affordance. Returns a locator-ish
   * boolean; the restore spec skips with a documented reason when absent.
   */
  async hasRestoreAffordance() {
    const candidates = this.page.getByText(/trash|deleted groups|restore|recycle bin|archived/i);
    return (await candidates.first().isVisible().catch(() => false));
  }
}

export default SpacesPage;
