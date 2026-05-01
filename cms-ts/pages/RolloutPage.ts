import { Locator, expect } from '@playwright/test';
import { BasePage, step } from './BasePage';

/**
 * Wraps the /content-rollout list and the rollout-detail editor (rows /
 * content / save / publish).
 */
export class RolloutPage extends BasePage {
  // ─── List view ─────────────────────────────────────────────────────────────
  get newRolloutButton() {
    return this.page.getByRole('button', { name: /New Rollout/i });
  }
  get rolloutSearch() {
    return this.page.getByPlaceholder(/Search rollouts/i);
  }
  rolloutCard(name: string): Locator {
    return this.page
      .locator('div')
      .filter({ has: this.page.getByRole('heading', { name }) })
      .first();
  }

  // ─── Create modal ──────────────────────────────────────────────────────────
  get createModal() { return this.page.locator('#addRollout.show'); }
  get createName() {
    return this.createModal.getByPlaceholder(/Q4 Brand Launch/i);
  }
  get createDescription() {
    return this.createModal.locator('textarea');
  }
  get createSubmit() {
    return this.createModal.getByRole('button', { name: /^Create$/ });
  }

  // ─── Detail / config ───────────────────────────────────────────────────────
  get chooseGroupButton() {
    return this.page.getByRole('button', { name: /Choose Group/i });
  }
  get setMainGroupModal() { return this.page.locator('#setMainGroup.show'); }
  get setMainGroupSelect() { return this.setMainGroupModal.locator('select'); }
  get setMainGroupSave() {
    return this.setMainGroupModal.getByRole('button', { name: /^Save$/ });
  }
  get addRowButton() {
    // Toolbar button labeled "+ Row" — match any leading icon/whitespace/plus
    return this.page.locator('button').filter({ hasText: /^[\s+]*Row\s*$/i }).first();
  }
  get addRowModal() { return this.page.locator('#addRow.show'); }
  get addRowCode() {
    return this.addRowModal.getByPlaceholder(/e\.g\. DEL/i);
  }
  get addRowSubmit() {
    return this.addRowModal.getByRole('button', { name: /^Add$/ });
  }
  get addContentButton() {
    return this.page.locator('button').filter({ hasText: /^[\s+]*Content\s*$/i }).first();
  }
  get saveButton() {
    // Toolbar label is "Save changes" or "Saved" depending on dirty state.
    // Restrict to visible buttons that aren't inside an inactive modal.
    return this.page
      .locator('button:visible')
      .filter({ hasText: /^\s*Save( changes)?\s*$/i })
      .first();
  }
  get publishButton() {
    return this.page.locator('button').filter({ hasText: /^\s*Publish\s*$/i }).first();
  }
  get matrix() { return this.page.locator('table, [role="table"]').first(); }

  // ─── Actions ───────────────────────────────────────────────────────────────
  async openList() {
    step('open Rollouts list');
    await this.goto('/content-rollout');
    await expect(this.newRolloutButton).toBeVisible({ timeout: 15_000 });
  }

  async openCreateModal() {
    step('open New Rollout modal');
    await this.newRolloutButton.click();
    await expect(this.createModal).toBeVisible({ timeout: 10_000 });
  }

  async createRollout(name: string, description: string) {
    step(`create rollout "${name}"`);
    await this.openCreateModal();
    await this.createName.fill(name);
    await this.createDescription.fill(description);
    await this.createSubmit.click();
    await this.page.waitForURL(/\/content-rollout\/[a-f0-9]+/i, { timeout: 15_000 });
  }

  async setMainGroup(preferred: string, fallback: string): Promise<string> {
    step(`set main group (preferred="${preferred}", fallback="${fallback}")`);
    // The "Choose Group" button on the empty-state and "Select Main Group" in the
    // header both open the same modal; use whichever is visible.
    const opener = this.page.getByRole('button', { name: /Choose Group|Select Main Group/i }).first();
    await opener.click();
    await expect(this.setMainGroupSelect).toBeVisible({ timeout: 10_000 });
    // Wait for groups to populate (more than just the default "— Choose —")
    await expect.poll(
      async () => (await this.setMainGroupSelect.locator('option').count()),
      { timeout: 15_000 },
    ).toBeGreaterThan(1);
    const opts = (await this.setMainGroupSelect.locator('option').allTextContents())
      .map(s => s.trim());
    const choice =
         opts.find(o => o.toLowerCase() === preferred.toLowerCase())
      || opts.find(o => o.toLowerCase() === fallback.toLowerCase())
      || opts.find(o => o && !/choose/i.test(o));
    if (!choice) throw new Error('No selectable Main Group options');
    await this.setMainGroupSelect.selectOption({ label: choice });
    await this.setMainGroupSave.click();
    await this.waitForModalClosed('setMainGroup');
    return choice;
  }

  async addRow(code: string) {
    step(`add row with code "${code}"`);
    await this.addRowButton.click();
    await expect(this.addRowModal).toBeVisible({ timeout: 10_000 });
    await this.addRowCode.fill(code);
    await this.addRowSubmit.click();
    await this.waitForModalClosed('addRow');
    await expect(this.matrix.getByText(code).first()).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Add Content opens a small modal asking for a Content Name + Duration.
   * Fills in defaults and submits.
   */
  async addContentColumn(name = `Content_${Date.now().toString().slice(-5)}`) {
    step(`add content column "${name}"`);
    await this.addContentButton.click();
    const modal = this.page.locator('.modal.show').filter({ hasText: /Add Content/i }).first();
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal.getByPlaceholder(/Hero Cut/i).fill(name);
    await modal.getByRole('button', { name: /^Add$/ }).click();
    await expect(modal).toBeHidden({ timeout: 10_000 });
  }

  async save() {
    step('save rollout');
    if (await this.saveButton.count()) await this.saveButton.first().click();
  }

  async publish() {
    step('publish rollout');
    await this.publishButton.click();
    const confirm = this.page.getByRole('button', { name: /^(Publish|Confirm|Yes)$/ }).last();
    if (await confirm.count()) await confirm.click().catch(() => {});
  }

  // ─── State indicators ─────────────────────────────────────────────────────
  /** The "Unsaved" pill visible in the rollout-detail header when dirty. */
  get unsavedBadge() {
    return this.page.getByText(/^\s*•?\s*Unsaved\s*$/i).first();
  }
  async expectUnsavedVisible() {
    await expect(this.unsavedBadge).toBeVisible({ timeout: 5_000 });
  }
  async expectUnsavedGone() {
    await expect(this.unsavedBadge).toBeHidden({ timeout: 10_000 });
  }

  // ─── List-card helpers ────────────────────────────────────────────────────
  get discardButton() {
    return this.page.locator('button:visible').filter({ hasText: /^\s*Discard\s*$/i }).first();
  }
  get backButton() {
    // Round arrow button at the top of the rollout detail page
    return this.page.getByRole('button', { name: /^\s*Back\s*$/i })
      .or(this.page.locator('a[href="/content-rollout"], button[aria-label*="back" i]'))
      .first();
  }

  async openRollout(name: string) {
    step(`open rollout "${name}"`);
    await this.openList();
    const card = this.rolloutCard(name);
    await expect(card).toBeVisible({ timeout: 10_000 });
    const open = card.getByRole('link', { name: /open/i });
    if (await open.count()) {
      await open.first().click();
    } else {
      await card.click();
    }
    await this.page.waitForURL(/\/content-rollout\/[a-f0-9]+/i, { timeout: 15_000 });
  }

  /** True when the named rollout card shows a "Published" badge. */
  async isPublished(name: string): Promise<boolean> {
    const card = this.rolloutCard(name);
    if (!(await card.count())) return false;
    return /published/i.test((await card.textContent()) || '');
  }

  async deleteFromList(name: string): Promise<boolean> {
    step(`delete rollout "${name}"`);
    await this.openList();
    const card = this.rolloutCard(name);
    if (!(await card.count())) return false;
    // The Rollout cards expose a trash icon button directly on the card
    const trash = card.locator('button[aria-label*="delete" i], button[title*="delete" i]')
      .or(card.getByRole('button', { name: /delete|trash/i }));
    if (await trash.count()) {
      await trash.first().click().catch(() => {});
    } else {
      await card.locator('button').first().click().catch(() => {});
      const del = this.page.getByRole('menuitem', { name: /delete/i })
        .or(this.page.getByRole('button', { name: /^Delete$/ }));
      if (!(await del.count())) return false;
      await del.first().click().catch(() => {});
    }
    const confirm = this.page.getByRole('button', { name: /^(Delete|Confirm|Yes)$/ });
    if (await confirm.count()) await confirm.first().click().catch(() => {});
    return true;
  }
}
